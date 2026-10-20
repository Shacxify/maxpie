import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { identifyInstructions, systemPrompt } from "./persona.js";

// A small, cheap model that can see images. Set OPENAI_MODEL (e.g. gpt-5.5) for sharper IDs.
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

let client: OpenAI | undefined;
// The SDK retries 429s and 5xx overloads on its own. Three tries at 25s stays under the 90s deadline in src/bot.ts.
const ai = (): OpenAI => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 25_000 }));

export const IdentificationSchema = z.object({
  photo_usable: z.boolean(),
  is_animal: z.boolean(),
  common_name: z.string(),
  scientific_name: z.string(),
  excitement: z.enum(["common", "notable", "rare"]),
  max_take: z.string(),
  facts: z.array(z.string()),
});

export type Identification = z.infer<typeof IdentificationSchema>;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type IdentifyResult =
  | { kind: "ok"; id: Identification }
  | { kind: "refused" }
  | { kind: "failed"; reason: string };

// The model can decline with a refusal instead of answering.
function refused(response: OpenAI.Responses.Response): boolean {
  return response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
}

export async function identifyAnimal(
  image: { data: string; mediaType: ImageMediaType },
  message: string | undefined,
): Promise<IdentifyResult> {
  // Whatever they typed ("what the heck is this?? saw it at alviso") is context, not instructions.
  const note = message
    ? `The person who posted this wrote: "${message}". Use any place or detail they mention as context.`
    : "They didn't say anything else.";

  const response = await ai().responses.parse({
    model: MODEL,
    instructions: systemPrompt(),
    input: [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: `data:${image.mediaType};base64,${image.data}`, detail: "auto" },
          { type: "input_text", text: `${identifyInstructions}\n\n${note}` },
        ],
      },
    ],
    text: { format: zodTextFormat(IdentificationSchema, "identification") },
  });

  if (refused(response)) return { kind: "refused" };
  if (response.status === "incomplete") {
    return { kind: "failed", reason: `incomplete: ${response.incomplete_details?.reason ?? "unknown"}` };
  }
  if (!response.output_parsed) return { kind: "failed", reason: "no parsed output" };
  return { kind: "ok", id: response.output_parsed };
}

// Mentions without a photo ("@maxpie how do i get birds to come to my yard?").
export async function askMax(question: string): Promise<string | null> {
  const response = await ai().responses.create({
    model: MODEL,
    instructions: `${systemPrompt()}\n\nSomeone just @mentioned you in a Discord chat. Reply like a person in the chat: short, a few sentences at most, plain text, no headers or lists unless they really help.`,
    input: question,
  });

  if (refused(response)) return null;
  return response.output_text.trim() || null;
}
