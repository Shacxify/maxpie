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
  reply: "mm. house finch. the red's from what he eats, so this guy's eating good.",
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
  assert.ok(body.generationConfig.responseJsonSchema.required.includes("reply"));
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
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ ...finch, reply: 42 }) }] }, finishReason: "STOP" }],
  });
  const result = await identifyAnimal(image, undefined);
  assert.equal(result.kind, "failed");
});

test("a slow, busy, or out-of-quota model hands off to the next one", async () => {
  const urls: string[] = [];
  const failures = [
    () => Promise.reject(new DOMException("This operation was aborted", "AbortError")),
    () => Promise.resolve(new Response(JSON.stringify({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }), { status: 429 })),
  ];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input instanceof Request ? input.url : input));
    const fail = failures[urls.length - 1];
    if (fail) return fail();
    return new Response(
      JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(finch) }] }, finishReason: "STOP" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  assert.deepEqual(await identifyAnimal(image, undefined), { kind: "ok", id: finch });
  assert.deepEqual(
    urls.map((u) => u.match(/models\/([^:]+):/)?.[1]),
    ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.5-flash"],
  );
});

test("a bad key stops right away instead of trying every model", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 401, message: "bad key", status: "UNAUTHENTICATED" } }), { status: 401 });
  }) as typeof fetch;

  await assert.rejects(identifyAnimal(image, undefined));
  assert.equal(calls, 1);
});
