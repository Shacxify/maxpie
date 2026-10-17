// Finds the Wikipedia article for an ID so people can read more. Best effort: no link beats a wrong link.

import type { Identification } from "./model.js";

const USER_AGENT = "Maxpie/0.2 (Discord wildlife bot; https://github.com/shacxify/maxpie)";

export async function wikipediaUrl(id: Identification): Promise<string | undefined> {
  for (const title of [id.scientific_name, id.common_name]) {
    if (!title.trim()) continue;
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replaceAll(" ", "_"))}`,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) continue;
      const page = (await res.json()) as { type?: string; content_urls?: { desktop?: { page?: string } } };
      const url = page.content_urls?.desktop?.page;
      if (page.type !== "disambiguation" && url) return url;
    } catch {
      // try the next title
    }
  }
  return undefined;
}
