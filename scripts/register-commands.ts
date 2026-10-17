// Registers /identify and /askmax with Discord. Run once, and again whenever src/commands.ts changes:
//   npm run register   (reads .env)
// Set DISCORD_GUILD_ID to register on one server instantly (global commands can take a while to show up).

import { commands } from "../src/commands.js";

const appId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !botToken) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN first.");
  process.exit(1);
}

const url = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error(`Registration failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Registered ${commands.length} commands ${guildId ? `on guild ${guildId}` : "globally"}.`);
