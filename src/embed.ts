import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import type { Identification } from "./claude.js";
import type { Enrichment } from "./enrich.js";
import { lines } from "./persona.js";

const COLORS = { common: 0x8a9a5b, notable: 0x3e7cb1, rare: 0xe0a100 } as const;
const CONFIDENCE_LABEL = { high: "high", medium: "medium", low: "low, squint harder" } as const;

// Discord's hard limits.
const FIELD_MAX = 1024;
const DESCRIPTION_MAX = 4096;
const TITLE_MAX = 256;

// How often the footer is just "max left." instead of the data credits.
const MAX_LEFT_CHANCE = 0.2;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

function field(name: string, value: string | undefined, inline = false): APIEmbedField[] {
  const trimmed = value?.trim();
  return trimmed ? [{ name, value: truncate(trimmed, FIELD_MAX), inline }] : [];
}

export function buildEmbed(
  id: Identification,
  extra: Enrichment,
  photoUrl: string | undefined,
  random: () => number = Math.random,
): APIEmbed {
  const rare = id.excitement === "rare";
  const title = rare ? `${id.common_name.toUpperCase()}!!` : id.common_name;

  // GBIF's IUCN category is the source of truth when we have it; Max adds the color.
  const conservation = extra.gbif?.iucnCategory
    ? `IUCN: ${extra.gbif.iucnCategory}. ${id.conservation_status}`
    : id.conservation_status;

  const sightings = extra.sightings
    ? extra.sightings.count > 0
      ? `${extra.sightings.count} eBird report${extra.sightings.count === 1 ? "" : "s"} within ${extra.sightings.radiusKm} km of ${extra.sightings.place} in the last 30 days` +
        (extra.sightings.latestDate ? `, latest ${extra.sightings.latestDate}` : "")
      : `no eBird reports within ${extra.sightings.radiusKm} km of ${extra.sightings.place} in the last 30 days. could be a good bird.`
    : undefined;

  const credits = ["GBIF", "Wikipedia", extra.sightings && "eBird", extra.recording && "xeno-canto"].filter(Boolean);

  return {
    title: truncate(title, TITLE_MAX),
    url: extra.wikipedia?.url,
    description: truncate(id.max_take, DESCRIPTION_MAX),
    color: COLORS[id.excitement],
    fields: [
      ...field("Scientific name", id.scientific_name.trim() && `*${id.scientific_name.trim()}*`, true),
      ...field("Confidence", `${CONFIDENCE_LABEL[id.confidence]}. ${id.confidence_line}`, true),
      ...field("Likely region", `${id.likely_region}. ${id.region_reasoning}`),
      ...field("Field notes", id.field_notes),
      ...field("Conservation status", conservation),
      ...field("ID tip", id.id_tip),
      ...field("Range & migration", id.migration_notes),
      ...field("Song / call", extra.recording && `[${extra.recording.description}](${extra.recording.url})`),
      ...field("Nearby sightings", sightings),
      ...field("Fun fact", id.fun_fact),
    ],
    image: photoUrl ? { url: photoUrl } : undefined,
    thumbnail: extra.wikipedia?.thumbnail ? { url: extra.wikipedia.thumbnail } : undefined,
    footer: { text: random() < MAX_LEFT_CHANCE ? lines.maxLeft : `data: ${credits.join(" · ")}` },
  };
}
