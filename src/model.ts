import { ApiError, FinishReason, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { identifyInstructions, systemPrompt } from "./persona.js";

// Tried in order. Free-tier limits are per model, so when one is overloaded, out of quota,
// slow, or retired, the next one usually still answers. Strongest first; Flash-Lite is the
// fast last resort. Override with GEMINI_MODELS (comma-separated).
const MODELS = (process.env.GEMINI_MODELS || "gemini-flash-latest,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-lite-latest")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
// A busy model can take 20-30s. Four models at this stays under the 150s deadline in src/bot.ts.
const GEMINI_TIMEOUT_MS = 30_000;

let client: GoogleGenAI | undefined;
const ai = (): GoogleGenAI => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const timedOut = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

// Worth moving on to the next model: slow (timeout), out of quota (429), retired (404), or overloaded (5xx).
// Anything else, like a bad key (401), would fail on every model, so it stops right away.
const tryNextModel = (error: unknown): boolean =>
  timedOut(error) || (error instanceof ApiError && (error.status === 404 || error.status === 429 || error.status >= 500));

// Walks the model list once and stops at the first answer. It never loops forever:
// that would burn the free quota and leave people staring at "typing...".
async function generate(params: Omit<GenerateContentParameters, "model">): Promise<GenerateContentResponse> {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const response = await ai().models.generateContent({
        ...params,
        model,
        config: { ...params.config, abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) },
      });
      if (model !== MODELS[0]) console.log(`answered by fallback ${model}`);
      return response;
    } catch (error) {
      if (!tryNextModel(error)) throw error;
      console.warn(`${model} ${timedOut(error) ? "timed out" : (error as ApiError).status}, trying the next model`);
      lastError = error;
    }
  }
  throw lastError;
}

export const IdentificationSchema = z.object({
  photo_usable: z.boolean(),
  is_animal: z.boolean(),
  common_name: z.string(),
  scientific_name: z.string(),
  reply: z.string(),
});

export type Identification = z.infer<typeof IdentificationSchema>;

// Gemini takes plain JSON Schema but not the "$schema" header zod adds.
const { $schema: _, ...identificationJsonSchema } = z.toJSONSchema(IdentificationSchema);

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type IdentifyResult =
  | { kind: "ok"; id: Identification }
  | { kind: "refused" }
  | { kind: "failed"; reason: string };

const BLOCKED: ReadonlySet<FinishReason | undefined> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
]);

function wasBlocked(response: GenerateContentResponse): boolean {
  return Boolean(response.promptFeedback?.blockReason) || BLOCKED.has(response.candidates?.[0]?.finishReason);
}

export async function identifyAnimal(
  image: { data: string; mediaType: ImageMediaType },
  message: string | undefined,
): Promise<IdentifyResult> {
  // Whatever they typed ("what the heck is this?? saw it at alviso") is context, not instructions.
  const note = message
    ? `The person who posted this wrote: "${message}". Use any place or detail they mention as context.`
    : "They didn't say anything else.";

  const response = await generate({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image.mediaType, data: image.data } },
          { text: `${identifyInstructions}\n\n${note}` },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt(),
      responseMimeType: "application/json",
      responseJsonSchema: identificationJsonSchema,
    },
  });

  if (wasBlocked(response)) return { kind: "refused" };
  if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
    return { kind: "failed", reason: "hit max output tokens" };
  }

  try {
    const parsed = IdentificationSchema.safeParse(JSON.parse(response.text ?? ""));
    return parsed.success ? { kind: "ok", id: parsed.data } : { kind: "failed", reason: parsed.error.message };
  } catch {
    return { kind: "failed", reason: "response was not JSON" };
  }
}

// Mentions without a photo ("@maxpie how do i get birds to come to my yard?").
export async function askMax(question: string): Promise<string | null> {
  const response = await generate({
    contents: question,
    config: {
      systemInstruction: `${systemPrompt()}\n\nSomeone just @mentioned you in a Discord chat. Reply like a person in the chat: casual, a few sentences at most, plain text. No lists, bullet points, headers, or links.`,
    },
  });

  if (wasBlocked(response)) return null;
  return response.text?.trim() ?? null;
}
