// Discord sends every slash command here (set this URL as the app's Interactions Endpoint).
// Discord wants an answer within 3 seconds and a vision call takes longer, so Max replies
// "hold on..." right away and waitUntil keeps the function alive to finish the real answer.

import { waitUntil } from "@vercel/functions";
import { verifyKey } from "discord-interactions";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandInteractionDataOption,
  type APIAttachment,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { ApiError } from "@google/genai";
import { askMax, identifyAnimal } from "../src/model.js";
import { editOriginal, fetchPhoto } from "../src/discord.js";
import { buildEmbed, truncate } from "../src/embed.js";
import { enrich } from "../src/enrich.js";
import { lines } from "../src/persona.js";

const COOLDOWN_SECONDS = 30;
// Best effort: only holds while this function instance stays warm. Move to Supabase with life lists.
const lastUse = new Map<string, number>();

const reply = (response: APIInteractionResponse): Response => Response.json(response);

const say = (content: string, ephemeral = false): Response =>
  reply({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: ephemeral ? MessageFlags.Ephemeral : undefined },
  });

function option(options: APIApplicationCommandInteractionDataOption[] | undefined, name: string) {
  return options?.find((o) => o.name === name);
}

function stringOption(interaction: APIChatInputApplicationCommandInteraction, name: string): string | undefined {
  const opt = option(interaction.data.options, name);
  return opt?.type === ApplicationCommandOptionType.String ? opt.value.trim() || undefined : undefined;
}

function attachmentOption(interaction: APIChatInputApplicationCommandInteraction, name: string): APIAttachment | undefined {
  const opt = option(interaction.data.options, name);
  if (opt?.type !== ApplicationCommandOptionType.Attachment) return undefined;
  return interaction.data.resolved?.attachments?.[opt.value];
}

function onCooldown(userId: string): number {
  const now = Date.now();
  const remaining = Math.ceil(((lastUse.get(userId) ?? 0) + COOLDOWN_SECONDS * 1000 - now) / 1000);
  if (remaining > 0) return remaining;
  lastUse.set(userId, now);
  return 0;
}

async function finishIdentify(interaction: APIChatInputApplicationCommandInteraction, photo: APIAttachment) {
  const edit = (body: Parameters<typeof editOriginal>[2]) => editOriginal(interaction.application_id, interaction.token, body);
  const location = stringOption(interaction, "location");

  try {
    const image = await fetchPhoto(photo);
    if (image.kind === "unsupported") return edit({ content: lines.badFile });
    if (image.kind === "too_big") return edit({ content: lines.tooBig });

    const result = await identifyAnimal(image, location);
    if (result.kind === "refused") return edit({ content: lines.refusal });
    if (result.kind === "failed") {
      console.error(`identify failed: ${result.reason}`);
      return edit({ content: lines.apiError });
    }

    const id = result.id;
    if (!id.is_animal) return edit({ content: lines.notAnimal });
    if (!id.photo_usable) return edit({ content: lines.blurry });

    const extra = await enrich(id, location);
    return edit({ embeds: [buildEmbed(id, extra, photo.url)] });
  } catch (error) {
    console.error(error instanceof ApiError ? `Gemini API ${error.status}: ${error.message}` : error);
    return edit({ content: lines.apiError });
  }
}

async function finishAsk(interaction: APIChatInputApplicationCommandInteraction, question: string) {
  try {
    const answer = await askMax(question);
    await editOriginal(interaction.application_id, interaction.token, {
      content: truncate(answer || lines.refusal, 2000),
    });
  } catch (error) {
    console.error(error instanceof ApiError ? `Gemini API ${error.status}: ${error.message}` : error);
    await editOriginal(interaction.application_id, interaction.token, { content: lines.apiError });
  }
}

function handleCommand(interaction: APIChatInputApplicationCommandInteraction): Response {
  const userId = interaction.member?.user.id ?? interaction.user?.id ?? "unknown";

  switch (interaction.data.name) {
    case "identify": {
      const photo = attachmentOption(interaction, "photo");
      if (!photo) return say(lines.badFile, true);
      const wait = onCooldown(userId);
      if (wait) return say(lines.cooldown(wait), true);
      waitUntil(finishIdentify(interaction, photo));
      return say(lines.loading);
    }
    case "askmax": {
      const question = stringOption(interaction, "question");
      if (!question) return say(lines.unknownCommand, true);
      const wait = onCooldown(userId);
      if (wait) return say(lines.cooldown(wait), true);
      waitUntil(finishAsk(interaction, question));
      return say(lines.loading);
    }
    default:
      return say(lines.unknownCommand, true);
  }
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return new Response("DISCORD_PUBLIC_KEY is not set", { status: 500 });
  if (!signature || !timestamp || !(await verifyKey(body, signature, timestamp, publicKey))) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as APIInteraction;

  if (interaction.type === InteractionType.Ping) {
    return reply({ type: InteractionResponseType.Pong });
  }
  if (interaction.type === InteractionType.ApplicationCommand && interaction.data.type === ApplicationCommandType.ChatInput) {
    return handleCommand(interaction as APIChatInputApplicationCommandInteraction);
  }
  return say(lines.unknownCommand, true);
}
