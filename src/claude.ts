import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { identifyInstructions, systemPrompt } from "./persona.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

// "default" lets the API retry a policy decline on Anthropic's recommended fallback model,
// so a false positive on a weird photo doesn't turn into a dead command.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const client = new Anthropic();

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

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type IdentifyResult =
  | { kind: "ok"; id: Identification }
  | { kind: "refused" }
  | { kind: "failed"; reason: string };

export async function identifyAnimal(
  image: { data: string; mediaType: ImageMediaType },
  location: string | undefined,
): Promise<IdentifyResult> {
  const note = location
    ? `The person who posted this says it was taken around: "${location}". Use that as context, region level only.`
    : "No location was given. Infer the region from the photo alone.";

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(IdentificationSchema),
    },
    system: systemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: `${identifyInstructions}\n\n${note}` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") return { kind: "refused" };
  if (response.stop_reason === "max_tokens") return { kind: "failed", reason: "hit max_tokens" };
  if (!response.parsed_output) return { kind: "failed", reason: "no parsed output" };
  return { kind: "ok", id: response.parsed_output };
}

// Free-form questions for /askmax ("how do i get birds to come to my yard?").
export async function askMax(question: string): Promise<string | null> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `${systemPrompt()}\n\nYou're answering a question in a Discord channel. Keep it under 1500 characters. Plain text, no headers.`,
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") return null;
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
}
