import type { ImageMediaType } from "./model.js";

// Plenty of detail for an ID; bigger photos just cost more tokens.
const MAX_EDGE_PX = 1568;
// Gemini caps inline requests at 20 MB, so leave room for the prompt.
const MAX_BYTES = 15 * 1024 * 1024;

const SUPPORTED: readonly ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// The bits of a Discord attachment we need.
export interface PhotoSource {
  url: string;
  proxyUrl: string;
  width?: number | null;
  height?: number | null;
  contentType?: string | null;
}

export type PhotoResult =
  | { kind: "ok"; data: string; mediaType: ImageMediaType }
  | { kind: "unsupported" }
  | { kind: "too_big" };

export function supportedMediaType(contentType: string | null | undefined): ImageMediaType | undefined {
  const base = contentType?.split(";")[0]?.trim().toLowerCase();
  return SUPPORTED.find((t) => t === base);
}

// Ask Discord's media proxy for a resized copy so phone photos upload fast and cheap.
export function resizedUrl(photo: PhotoSource): string {
  const { width, height } = photo;
  if (!width || !height || Math.max(width, height) <= MAX_EDGE_PX) return photo.url;
  const scale = MAX_EDGE_PX / Math.max(width, height);
  const url = new URL(photo.proxyUrl);
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

export async function fetchPhoto(photo: PhotoSource): Promise<PhotoResult> {
  if (!supportedMediaType(photo.contentType)) return { kind: "unsupported" };

  // Fall back to the original file if the resized copy can't be fetched.
  const file = (await download(resizedUrl(photo))) ?? (await download(photo.url));
  // The proxy can re-encode, so trust what came back over what was uploaded.
  const mediaType = supportedMediaType(file?.contentType) ?? supportedMediaType(photo.contentType);
  if (!file || !mediaType) return { kind: "unsupported" };
  if (file.bytes.byteLength > MAX_BYTES) return { kind: "too_big" };

  return { kind: "ok", data: Buffer.from(file.bytes).toString("base64"), mediaType };
}
