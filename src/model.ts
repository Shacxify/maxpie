import { FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { identifyInstructions, systemPrompt } from "./persona.js";

// gemini-flash-latest tracks Google's newest Flash model, which is fast and covered by the free tier.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

let client: GoogleGenAI | undefined;
const ai = (): GoogleGenAI => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const IdentificationSchema = z.object({
  photo_usable: z.boolean(),
  is_animal: z.boolean(),
  common_name: z.string(),
  scientific_name: z.string(),
  is_bird: z.boolean(),
  ebird_species_code: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  confidence_line: z.string(),
  likely_region: z.string(),
  region_reasoning: z.string(),
  field_notes: z.string(),
  conservation_status: z.string(),
  fun_fact: z.string(),
  id_tip: z.string(),
  migration_notes: z.string(),
  excitement: z.enum(["common", "notable", "rare"]),
  max_take: z.string(),
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
  location: string | undefined,
): Promise<IdentifyResult> {
  const note = location
    ? `The person who posted this says it was taken around: "${location}". Use that as context, region level only.`
    : "No location was given. Infer the region from the photo alone.";

  const response = await ai().models.generateContent({
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

// Free-form questions for /askmax ("how do i get birds to come to my yard?").
export async function askMax(question: string): Promise<string | null> {
  const response = await ai().models.generateContent({
    model: MODEL,
    contents: question,
    config: {
      systemInstruction: `${systemPrompt()}\n\nYou're answering a question in a Discord channel. Keep it under 1500 characters. Plain text, no headers.`,
    },
  });

  if (wasBlocked(response)) return null;
  return response.text?.trim() ?? null;
}
