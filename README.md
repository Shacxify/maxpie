# Maxpie

A Discord bot that identifies animals from photos, voiced by **Max Liske**: a burnt-out field ornithologist who knows more about birds than anyone in your server and has never once tucked in a shirt.

Max + magpie, the bird famous for collecting shiny things (like your photos).

## How to use it

No commands. Just talk to him.

- **Post a photo and @mention him:** `what the heck is this? @Maxpie`
- **Reply to someone else's photo** with `@Maxpie ??`
- **Ask him something**, no photo needed: `@Maxpie should i play bird calls to attract birds?`
- **DM him** and he answers without the @

He shows "Maxpie is typing...", then answers like anyone else in chat, no lists or links:

> BURROWING OWL. Athene cunicularia. OH MAN. absolute favorite. these little guys are declining fast across western north america due to habitat loss... look at those long legs made for running around open country and sitting on fence posts.

## How it works

Max is a small Node.js program that stays connected to Discord. When someone mentions him, he grabs the photo (from their message or the one they replied to), asks Gemini to identify it and answer in his voice, and replies.

| File | Job |
| --- | --- |
| `src/index.ts` | Connects to Discord and listens for messages |
| `src/bot.ts` | Decides when Max answers and what he says |
| `src/model.ts` | Gemini calls and the identification schema |
| `src/persona.ts` | Max's personality and canned lines |
| `src/photo.ts` | Downloads and resizes photos |

Because he has to stay connected, Max needs somewhere that runs all the time (not Vercel, which only runs code when a web request comes in).

## Setup

1. **Discord app.** In the [Developer Portal](https://discord.com/developers/applications), open your app, go to **Bot**, and under **Privileged Gateway Intents** turn on **Message Content Intent**. Max needs it to see photos on messages people reply to. Copy the bot token from the same page (Reset Token if you need a fresh one).
2. **Invite him** to your server with the `bot` scope and the **Send Messages**, **Read Message History**, and **View Channels** permissions.
3. **Gemini key** from [Google AI Studio](https://aistudio.google.com/apikey).
4. **Run him somewhere that stays on.** Set the environment variables from `.env.example`, then:
   ```bash
   npm install
   npm start
   ```
   He logs `max is online as Maxpie#1234` when he's connected.

### Hosting on Heroku

The `Procfile` runs Max as a worker (no website, just the bot).

1. Create an app in the [Heroku dashboard](https://dashboard.heroku.com/new-app).
2. **Deploy** tab: connect GitHub, pick this repo, deploy the `main` branch, and turn on automatic deploys.
3. **Settings** tab > Config Vars: add `DISCORD_BOT_TOKEN`, `GEMINI_API_KEY`, and `MAX_PG_MODE`.
4. **Resources** tab: pick the Eco or Basic plan, make sure `web` is off (there isn't one), and switch `worker npm start` on.
5. **More > View logs** should show `max is online as ...`.

### Under-18 members

Set `MAX_PG_MODE=true` and Max's weed jokes become snack jokes ("snack break. back in 30s."). Do this if anyone in the server is under 18, so Discord doesn't flag the bot.

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm run typecheck
```

Max tries Gemini models in order (`gemini-flash-latest`, then `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-flash-lite-latest`). Free-tier limits are per model, so when one is overloaded, out of quota, or slow, the next one usually answers. He walks the list once and never retries forever, which would burn the free quota. Override the list with `GEMINI_MODELS` (comma-separated). Each person gets a 30 second cooldown between questions ("bowl break").

Max's full personality sheet lives in [docs/PERSONA.md](docs/PERSONA.md).
