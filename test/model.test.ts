import assert from "node:assert/strict";
import { test } from "node:test";

process.env.OPENAI_API_KEY = "test-key";

// Stand in for the OpenAI API. The SDK grabs fetch once, so route every call through one swappable handler.
let reply: object = {};
const sent: Array<{ url: string; body: any }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  sent.push({ url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const { askMax, identifyAnimal } = await import("../src/model.js");

const finch = {
  photo_usable: true,
  is_animal: true,
  common_name: "House Finch",
  scientific_name: "Haemorhous mexicanus",
  excitement: "common",
  max_take: "mm. house finch.",
  facts: ["the red comes from what he eats.", "hollywood finches."],
};

const response = (content: object[], extra: object = {}) => ({
  id: "resp_1",
  object: "response",
  status: "completed",
  model: "gpt-5.4-mini",
  output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content }],
  ...extra,
});

const image = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };

test("sends the photo, persona, and JSON schema, then parses the ID", async () => {
  sent.length = 0;
  reply = response([{ type: "output_text", text: JSON.stringify(finch), annotations: [] }]);

  const result = await identifyAnimal(image, "what the heck is this? saw it at Alviso Marsh");
  assert.deepEqual(result, { kind: "ok", id: finch });

  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/v1\/responses$/);
  const body = sent[0].body;
  assert.equal(body.model, "gpt-5.4-mini");
  assert.match(body.instructions, /Max Liske/);
  assert.equal(body.input[0].content[0].type, "input_image");
  assert.match(body.input[0].content[0].image_url, /^data:image\/jpeg;base64,aGVsbG8=$/);
  assert.match(body.input[0].content[1].text, /Alviso Marsh/);
  assert.equal(body.text.format.type, "json_schema");
  assert.ok(body.text.format.schema.required.includes("max_take"));
});

test("a refusal comes back as refused", async () => {
  reply = response([{ type: "refusal", refusal: "can't help with that" }]);
  assert.deepEqual(await identifyAnimal(image, undefined), { kind: "refused" });
});

test("a cut-off answer fails cleanly", async () => {
  reply = response([], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
  const result = await identifyAnimal(image, undefined);
  assert.equal(result.kind, "failed");
});

test("questions without a photo get Max's plain-text answer", async () => {
  sent.length = 0;
  reply = response([{ type: "output_text", text: "  just sit still and be boring.  ", annotations: [] }]);
  assert.equal(await askMax("how do i attract birds?"), "just sit still and be boring.");
  assert.equal(sent[0].body.input, "how do i attract birds?");
});
