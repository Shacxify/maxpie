import { ApiError, FinishReason, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { identifyInstructions, systemPrompt } from "./persona.js";

// gemini-flash-latest tracks Google's newest Flash model, which is fast and covered by the free tier.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Three tries at this plus the retry waits stays under the 90s deadline in src/bot.ts.
const GEMINI_TIMEOUT_MS = 25_000;
// Gemini sometimes answers 503 "high demand" or 429; those usually clear in a few seconds.
const RETRY_DELAYS_MS = [2_000, 5_000];

let client: GoogleGenAI | undefined;
const ai = (): GoogleGenAI => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const retryable = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 429 || error.status >= 500);

async function generate(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const attempt = () =>
    ai().models.generateContent({
      ...params,
      config: { ...params.config, abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) },
    });

  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await attempt();
    } catch (error) {
      if (!retryable(error)) throw error;
      console.warn(`Gemini ${(error as ApiError).status}, retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return attempt();
}

export const IdentificationSchema = z.object({
  photo_usable: z.boolean(),
  is_animal: z.boolean(),
  common_name: z.string(),
  scientific_name: z.string(),
  excitement: z.enum(["common", "notable", "rare"]),
  max_take: z.string(),
  facts: z.array(z.string()).min(1).max(3),
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
    model: MODEL,
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
    model: MODEL,
    contents: question,
    config: {
      systemInstruction: `${systemPrompt()}\n\nSomeone just @mentioned you in a Discord chat. Reply like a person in the chat: short, a few sentences at most, plain text, no headers or lists unless they really help.`,
    },
  });

  if (wasBlocked(response)) return null;
  return response.text?.trim() ?? null;
}
