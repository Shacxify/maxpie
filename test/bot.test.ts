import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "discord.js";
import { cleanText, isForMax, truncate } from "../src/bot.js";

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

const MAX = "1561088123864219728";

// Just the parts of a Discord message isForMax looks at.
function message(opts: { dm?: boolean; users?: string[]; roleBotIds?: (string | undefined)[]; repliedTo?: string }): Message {
  return {
    inGuild: () => !opts.dm,
    mentions: {
      users: new Map((opts.users ?? []).map((id) => [id, { id }])),
      roles: (opts.roleBotIds ?? []).map((botId) => ({ tags: botId ? { botId } : null })),
      repliedUser: opts.repliedTo ? { id: opts.repliedTo } : null,
    },
  } as unknown as Message;
}

test("Max answers when he's @mentioned", () => {
  assert.ok(isForMax(message({ users: [MAX] }), MAX));
});

test("Max answers when someone @mentions his Maxpie role instead of him", () => {
  assert.ok(isForMax(message({ roleBotIds: [MAX] }), MAX));
});

test("Max answers replies to his own messages, ping or not", () => {
  assert.ok(isForMax(message({ repliedTo: MAX }), MAX));
});

test("Max answers every DM", () => {
  assert.ok(isForMax(message({ dm: true }), MAX));
});

test("Max stays quiet otherwise", () => {
  assert.ok(!isForMax(message({}), MAX));
  assert.ok(!isForMax(message({ users: ["someone-else"] }), MAX));
  assert.ok(!isForMax(message({ roleBotIds: [undefined, "another-bot"] }), MAX));
  assert.ok(!isForMax(message({ repliedTo: "someone-else" }), MAX));
});
