import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText } from "../src/bot.js";
import type { Identification } from "../src/model.js";
import { formatId, truncate } from "../src/reply.js";

const finch: Identification = {
  photo_usable: true,
  is_animal: true,
  common_name: "House Finch",
  scientific_name: "Haemorhous mexicanus",
  excitement: "common",
  max_take: "mm. house finch. total trash bird, love him.",
  facts: ["the red comes from what he eats.", "they were sold as 'hollywood finches' in the 1940s."],
};

const stays = () => 0.99;
const leaves = () => 0;

test("an ID reads like a chat message: take, two facts, wiki link", () => {
  assert.equal(
    formatId(finch, "https://en.wikipedia.org/wiki/House_finch", stays),
    [
      "mm. house finch. total trash bird, love him.",
      "- the red comes from what he eats.\n- they were sold as 'hollywood finches' in the 1940s.",
      "<https://en.wikipedia.org/wiki/House_finch>",
    ].join("\n\n"),
  );
});

test("no wiki link when the lookup came up empty", () => {
  assert.ok(!formatId(finch, undefined, stays).includes("wikipedia"));
});

test("sometimes max just leaves", () => {
  assert.ok(formatId(finch, undefined, leaves).endsWith("*max left.*"));
});

test("replies stay under Discord's 2000 character limit", () => {
  const long = formatId({ ...finch, max_take: "a".repeat(5000) }, undefined, stays);
  assert.equal(long.length, 2000);
  assert.ok(long.endsWith("..."));
});

test("truncate leaves short text alone", () => {
  assert.equal(truncate("short", 10), "short");
});

test("mentions are stripped from what people typed", () => {
  assert.equal(cleanText("what the heck is this? <@1561088123864219728>"), "what the heck is this?");
  assert.equal(cleanText("<@!42>   yo   <@&7> max"), "yo max");
  assert.equal(cleanText("<@42>"), "");
});
