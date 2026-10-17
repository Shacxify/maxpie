// Free data sources that keep Max's facts grounded. Every lookup is best-effort:
// a slow or broken API drops that field from the embed instead of failing the reply.

import type { Identification } from "./model.js";

const USER_AGENT = "Maxpie/0.1 (Discord wildlife bot; https://github.com/shacxify/maxpie)";
const TIMEOUT_MS = 8000;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface Enrichment {
  gbif?: { scientificName: string; isBird: boolean; iucnCategory?: string; url: string };
  wikipedia?: { title: string; url: string; thumbnail?: string };
  sightings?: { count: number; latestDate?: string; radiusKm: number; place: string };
  recording?: { url: string; description: string };
}

// GBIF: confirms the scientific name is real and gives us the IUCN category.
async function lookupGbif(scientificName: string): Promise<Enrichment["gbif"]> {
  const match = await getJson<{
    usageKey?: number;
    acceptedUsageKey?: number;
    scientificName?: string;
    matchType?: string;
    class?: string;
  }>(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}`);
  if (!match?.usageKey || match.matchType === "NONE") return undefined;

  const key = match.acceptedUsageKey ?? match.usageKey;
  const iucn = await getJson<{ category?: string }>(`https://api.gbif.org/v1/species/${key}/iucnRedListCategory`);
  return {
    scientificName: match.scientificName ?? scientificName,
    isBird: match.class === "Aves",
    iucnCategory: iucn?.category?.replaceAll("_", " ").toLowerCase(),
    url: `https://www.gbif.org/species/${key}`,
  };
}

async function lookupWikipedia(id: Identification): Promise<Enrichment["wikipedia"]> {
  for (const title of [id.scientific_name, id.common_name]) {
    if (!title) continue;
    const page = await getJson<{
      type?: string;
      title?: string;
      content_urls?: { desktop?: { page?: string } };
      thumbnail?: { source?: string };
    }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`);
    const url = page?.content_urls?.desktop?.page;
    if (page && page.type !== "disambiguation" && url) {
      return { title: page.title ?? title, url, thumbnail: page.thumbnail?.source };
    }
  }
  return undefined;
}

// OpenStreetMap's Nominatim turns "Alviso Marsh" into coordinates for the eBird lookup.
// The coordinates never leave the server and never show up in the reply.
async function geocode(place: string): Promise<{ lat: string; lon: string } | null> {
  const results = await getJson<Array<{ lat: string; lon: string }>>(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`,
  );
  return results?.[0] ?? null;
}

const SIGHTINGS_RADIUS_KM = 50;

async function lookupSightings(id: Identification, place: string): Promise<Enrichment["sightings"]> {
  const key = process.env.EBIRD_API_KEY;
  const code = id.ebird_species_code.trim();
  if (!key || !code) return undefined;
  const headers = { "X-eBirdApiToken": key };

  // Gemini suggests the species code; eBird confirms it matches the scientific name before we trust it.
  const taxon = await getJson<Array<{ sciName: string }>>(
    `https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&species=${encodeURIComponent(code)}`,
    headers,
  );
  if (taxon?.[0]?.sciName.toLowerCase() !== id.scientific_name.trim().toLowerCase()) return undefined;

  const coords = await geocode(place);
  if (!coords) return undefined;

  const obs = await getJson<Array<{ obsDt: string }>>(
    `https://api.ebird.org/v2/data/obs/geo/recent/${encodeURIComponent(code)}?lat=${coords.lat}&lng=${coords.lon}&dist=${SIGHTINGS_RADIUS_KM}&back=30`,
    headers,
  );
  if (!obs) return undefined;
  const latestDate = obs.map((o) => o.obsDt).sort().at(-1)?.slice(0, 10);
  return { count: obs.length, latestDate, radiusKm: SIGHTINGS_RADIUS_KM, place };
}

async function lookupRecording(scientificName: string): Promise<Enrichment["recording"]> {
  const key = process.env.XENO_CANTO_API_KEY;
  const [genus, species] = scientificName.trim().split(/\s+/);
  if (!key || !genus || !species) return undefined;

  const query = `gen:${genus} sp:${species} q:A`;
  const data = await getJson<{ recordings?: Array<{ id: string; type?: string; cnt?: string }> }>(
    `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`,
  );
  const rec = data?.recordings?.[0];
  if (!rec) return undefined;
  const description = [rec.type, rec.cnt].filter(Boolean).join(", ");
  return { url: `https://xeno-canto.org/${rec.id}`, description: description || "recording" };
}

export async function enrich(id: Identification, location: string | undefined): Promise<Enrichment> {
  const [gbif, wikipedia] = await Promise.all([lookupGbif(id.scientific_name), lookupWikipedia(id)]);
  const isBird = gbif?.isBird ?? id.is_bird;

  const [sightings, recording] = isBird
    ? await Promise.all([
        location ? lookupSightings(id, location) : Promise.resolve(undefined),
        lookupRecording(id.scientific_name),
      ])
    : [undefined, undefined];

  return { gbif, wikipedia, sightings, recording };
}
