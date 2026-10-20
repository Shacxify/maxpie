import type { Identification } from "./model.js";
import { lines } from "./persona.js";

// Discord's message limit.
const MESSAGE_MAX = 2000;
// He's asked for two; never post a wall of them.
const MAX_FACTS = 3;
// How often Max just... leaves.
const MAX_LEFT_CHANCE = 0.15;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

// Reads like a person typed it: Max's take, a couple of facts, and a link (in <> so Discord skips the big preview card).
export function formatId(id: Identification, wikiUrl: string | undefined, random: () => number = Math.random): string {
  const parts = [id.max_take.trim()];
  const facts = id.facts.map((f) => f.trim()).filter(Boolean).slice(0, MAX_FACTS);
  if (facts.length) parts.push(facts.map((f) => `- ${f}`).join("\n"));
  if (wikiUrl) parts.push(`<${wikiUrl}>`);
  if (random() < MAX_LEFT_CHANCE) parts.push(`*${lines.maxLeft}*`);
  return truncate(parts.join("\n\n"), MESSAGE_MAX);
}
