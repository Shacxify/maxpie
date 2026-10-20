// Starts Max. Stays connected to Discord and answers whenever someone @mentions him.
//   npm start   (reads .env if there is one)

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { handleMessage } from "./bot.js";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("Set DISCORD_BOT_TOKEN first.");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY first.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Lets Max see photos on the message someone replies to. Turn it on under Bot > Privileged Gateway Intents.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  // DM channels aren't cached until they're used, so Discord.js needs this to hear the first DM.
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (ready) => {
  console.log(`max is online as ${ready.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  void handleMessage(message, client.user!.id);
});

await client.login(token);
