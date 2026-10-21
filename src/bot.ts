import { ApiError } from "@google/genai";
import type { Attachment, Message } from "discord.js";
import { askMax, identifyAnimal } from "./model.js";
import { lines } from "./persona.js";
import { fetchPhoto, supportedMediaType } from "./photo.js";

const COOLDOWN_SECONDS = 30;
// Max always answers within this, even if Gemini hangs. The typing indicator stays up the whole time.
const DEADLINE_MS = 150_000;
// Discord's typing indicator lasts about 10 seconds, so keep poking it.
const TYPING_REFRESH_MS = 8_000;

// Per-user cooldown. Lives in memory, so it resets when the bot restarts.
const lastUse = new Map<string, number>();

function onCooldown(userId: string): number {
  const now = Date.now();
  const remaining = Math.ceil(((lastUse.get(userId) ?? 0) + COOLDOWN_SECONDS * 1000 - now) / 1000);
  if (remaining > 0) return remaining;
  lastUse.set(userId, now);
  return 0;
}

// Discord's message limit is 2000 characters.
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

// "what the heck is this? <@123>" -> "what the heck is this?"
export function cleanText(content: string): string {
  return content.replace(/<@[!&]?\d+>/g, " ").replace(/\s+/g, " ").trim();
}

const isImage = (a: Attachment) => a.contentType?.startsWith("image/") ?? false;

// The photo can be on the message itself, or on the message it replies to
// ("@maxpie what is this" as a reply to someone else's picture).
async function findPhoto(message: Message): Promise<{ photo?: Attachment; unsupported: boolean }> {
  const candidates = [...message.attachments.values()];
  if (!candidates.some(isImage) && message.reference) {
    const original = await message.fetchReference().catch(() => undefined);
    if (original) candidates.push(...original.attachments.values());
  }
  const images = candidates.filter(isImage);
  const photo = images.find((a) => supportedMediaType(a.contentType));
  return { photo, unsupported: !photo && images.length > 0 };
}

async function answer(message: Message, text: string): Promise<string> {
  const started = Date.now();
  const log = (step: string) => console.log(`[${message.id}] ${step} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  const { photo, unsupported } = await findPhoto(message);
  if (unsupported) return lines.badFile;

  if (!photo) {
    if (!text) return lines.hello;
    log("question");
    return (await askMax(text)) || lines.refusal;
  }

  log("photo");
  const image = await fetchPhoto({
    url: photo.url,
    proxyUrl: photo.proxyURL,
    width: photo.width,
    height: photo.height,
    contentType: photo.contentType,
  });
  if (image.kind === "unsupported") return lines.badFile;
  if (image.kind === "too_big") return lines.tooBig;

  const result = await identifyAnimal(image, text || undefined);
  log(`gemini: ${result.kind}`);
  if (result.kind === "refused") return lines.refusal;
  if (result.kind === "failed") {
    console.error(`identify failed: ${result.reason}`);
    return lines.apiError;
  }

  const id = result.id;
  if (!id.is_animal) return lines.notAnimal;
  if (!id.photo_usable) return lines.blurry;
  return id.reply.trim() || lines.apiError;
}

function withDeadline(work: Promise<string>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      console.error(`gave up after ${DEADLINE_MS / 1000}s`);
      resolve(lines.apiError);
    }, DEADLINE_MS);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

// In DMs Max answers everything. In servers he answers when someone:
// - @mentions him,
// - @mentions his "Maxpie" role (Discord gives every bot one, and autocomplete often suggests it first), or
// - replies to one of his messages, even with the ping turned off.
export function isForMax(message: Message, botUserId: string): boolean {
  if (!message.inGuild()) return true;
  const { mentions } = message;
  return (
    mentions.users.has(botUserId) ||
    mentions.roles.some((role) => role.tags?.botId === botUserId) ||
    mentions.repliedUser?.id === botUserId
  );
}

export async function handleMessage(message: Message, botUserId: string): Promise<void> {
  if (message.author.bot) return;
  if (!isForMax(message, botUserId)) return;

  // Replies read like a normal chat message, and never ping anyone.
  const send = (content: string) =>
    message.reply({ content: truncate(content, 2000), allowedMentions: { parse: [], repliedUser: false } });

  const wait = onCooldown(message.author.id);
  if (wait) {
    await send(lines.cooldown(wait)).catch(() => {});
    return;
  }

  const channel = message.channel;
  const typing = () => ("sendTyping" in channel ? channel.sendTyping().catch(() => {}) : undefined);
  typing();
  const typingTimer = setInterval(typing, TYPING_REFRESH_MS);

  try {
    const work = answer(message, cleanText(message.content)).catch((error: unknown) => {
      console.error(error instanceof ApiError ? `Gemini API ${error.status}: ${error.message}` : error);
      return lines.apiError;
    });
    await send(await withDeadline(work));
  } catch (error) {
    console.error("couldn't send reply:", error);
  } finally {
    clearInterval(typingTimer);
  }
}
