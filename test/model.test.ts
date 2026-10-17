import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

process.env.GEMINI_API_KEY = "test-key";
const { identifyAnimal } = await import("../src/model.js");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const finch = {
  photo_usable: true,
  is_animal: true,
  common_name: "House Finch",
  scientific_name: "Haemorhous mexicanus",
  excitement: "common",
  max_take: "mm. house finch.",
  facts: ["the red comes from what he eats.", "hollywood finches."],
};

// Stand in for the Gemini REST API and remember what was sent.
function fakeGemini(reply: object) {
  const sent: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return sent;
}

const image = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };

test("sends the photo, persona, and JSON schema, then parses the ID", async () => {
  const sent = fakeGemini({
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(finch) }] }, finishReason: "STOP" }],
  });

  const result = await identifyAnimal(image, "what the heck is this? saw it at Alviso Marsh");
  assert.deepEqual(result, { kind: "ok", id: finch });

  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /models\/gemini-flash-latest:generateContent/);
  const body = sent[0].body;
  assert.equal(body.contents[0].parts[0].inlineData.mimeType, "image/jpeg");
  assert.match(body.contents[0].parts[1].text, /Alviso Marsh/);
  assert.match(body.systemInstruction.parts[0].text, /Max Liske/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseJsonSchema.$schema, undefined);
  assert.ok(body.generationConfig.responseJsonSchema.required.includes("max_take"));
});

test("a safety block becomes a refusal", async () => {
  fakeGemini({ candidates: [{ finishReason: "SAFETY" }] });
  assert.deepEqual(await identifyAnimal(image, undefined), { kind: "refused" });
});

test("a blocked prompt becomes a refusal", async () => {
  fakeGemini({ promptFeedback: { blockReason: "SAFETY" } });
  assert.deepEqual(await identifyAnimal(image, undefined), { kind: "refused" });
});

test("JSON that doesn't match the schema fails cleanly", async () => {
  fakeGemini({
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ ...finch, excitement: "vibes" }) }] }, finishReason: "STOP" }],
  });
  const result = await identifyAnimal(image, undefined);
  assert.equal(result.kind, "failed");
});
