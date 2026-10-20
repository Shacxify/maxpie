import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, truncate } from "../src/bot.js";

test("mentions are stripped from what people typed", () => {
  assert.equal(cleanText("what the heck is this? <@1561088123864219728>"), "what the heck is this?");
  assert.equal(cleanText("<@!42>   yo   <@&7> max"), "yo max");
  assert.equal(cleanText("<@42>"), "");
});

test("replies stay under Discord's 2000 character limit", () => {
  const long = truncate("a".repeat(5000), 2000);
  assert.equal(long.length, 2000);
  assert.ok(long.endsWith("..."));
});

test("truncate leaves short text alone", () => {
  assert.equal(truncate("short", 10), "short");
});
