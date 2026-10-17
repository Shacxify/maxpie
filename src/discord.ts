import type { APIAttachment, APIEmbed } from "discord-api-types/v10";
import type { ImageMediaType } from "./claude.js";

const API = "https://discord.com/api/v10";

// Claude's sweet spot for image size; bigger photos just cost more tokens.
const MAX_EDGE_PX = 1568;
// Claude API limit for a base64 image.
const MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED: readonly ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export type PhotoResult =
  | { kind: "ok"; data: string; mediaType: ImageMediaType }
  | { kind: "unsupported" }
  | { kind: "too_big" };

export function supportedMediaType(contentType: string | undefined): ImageMediaType | undefined {
  const base = contentType?.split(";")[0]?.trim().toLowerCase();
  return SUPPORTED.find((t) => t === base);
}

// Ask Discord's media proxy for a resized copy so phone photos fit under the 5 MB limit.
export function resizedUrl(attachment: APIAttachment): string {
  const { width, height, proxy_url } = attachment;
  if (!width || !height || Math.max(width, height) <= MAX_EDGE_PX) return attachment.url;
  const scale = MAX_EDGE_PX / Math.max(width, height);
  const url = new URL(proxy_url);
  url.searchParams.set("width", String(Math.round(width * scale)));
  url.searchParams.set("height", String(Math.round(height * scale)));
  return url.toString();
}

async function download(url: string): Promise<{ bytes: ArrayBuffer; contentType?: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? undefined };
  } catch {
    return null;
  }
}

export async function fetchPhoto(attachment: APIAttachment): Promise<PhotoResult> {
  if (!supportedMediaType(attachment.content_type)) return { kind: "unsupported" };

  // Fall back to the original file if the resized copy can't be fetched.
  const file = (await download(resizedUrl(attachment))) ?? (await download(attachment.url));
  // The proxy can re-encode, so trust what came back over what was uploaded.
  const mediaType = supportedMediaType(file?.contentType) ?? supportedMediaType(attachment.content_type);
  if (!file || !mediaType) return { kind: "unsupported" };
  if (file.bytes.byteLength > MAX_BYTES) return { kind: "too_big" };

  return { kind: "ok", data: Buffer.from(file.bytes).toString("base64"), mediaType };
}

// Replace the "hold on..." message with the real answer.
export async function editOriginal(
  applicationId: string,
  token: string,
  body: { content?: string; embeds?: APIEmbed[] },
): Promise<void> {
  const res = await fetch(`${API}/webhooks/${applicationId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: body.content ?? "", embeds: body.embeds ?? [] }),
  });
  if (!res.ok) console.error(`editOriginal failed: ${res.status} ${await res.text()}`);
}
