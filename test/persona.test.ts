import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { lines, systemPrompt } from "../src/persona.js";

afterEach(() => {
  delete process.env.MAX_PG_MODE;
});

test("default mode takes a bowl break", () => {
  assert.equal(lines.cooldown(30), "bowl break. back in 30s.");
  assert.match(systemPrompt(), /bowl break/);
});

test("PG mode swaps in snack breaks everywhere", () => {
  process.env.MAX_PG_MODE = "true";
  assert.equal(lines.cooldown(12), "snack break. back in 12s.");
  assert.doesNotMatch(systemPrompt(), /weed|bowl/i);
});
