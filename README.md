# Maxpie

A Discord bot that identifies animals from photos, voiced by **Max Liske**: a burnt-out field ornithologist who knows more about birds than anyone in your server and has never once tucked in a shirt.

Max + magpie, the bird famous for collecting shiny things (like your photos).

## How to use it

No commands. Just talk to him.

- **Post a photo and @mention him:** `what the heck is this? @Maxpie`
- **Reply to someone else's photo** with `@Maxpie ??`
- **Ask him something**, no photo needed: `@Maxpie should i play bird calls to attract birds?`
- **DM him** and he answers without the @

He shows "Maxpie is typing...", then replies like anyone else in chat:

> male house finch, classic yard trash bird but i still love 'em... i'd bet my binoculars on it.
>
> \- The redness of a male's plumage comes entirely from carotenoid pigments in their seed diet.
> \- Eastern populations exploded after pet vendors released "Hollywood Finches" on Long Island in 1940.
>
> https://en.wikipedia.org/wiki/House_finch

## How it works

Max is a small Node.js program that stays connected to Discord. When someone mentions him, he grabs the photo (from their message or the one they replied to), asks Gemini to identify it in his voice, finds the Wikipedia article, and replies.

| File | Job |
| --- | --- |
| `src/index.ts` | Connects to Discord and listens for messages |
| `src/bot.ts` | Decides when Max answers and what he says |
| `src/model.ts` | Gemini calls and the identification schema |
| `src/persona.ts` | Max's personality and canned lines |
| `src/photo.ts` | Downloads and resizes photos |
| `src/wiki.ts` | Finds the Wikipedia link |
| `src/reply.ts` | Formats the reply |

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

### Under-18 members

Set `MAX_PG_MODE=true` and Max's weed jokes become snack jokes ("snack break. back in 30s."). Do this if anyone in the server is under 18, so Discord doesn't flag the bot.

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm run typecheck
```

The model defaults to `gemini-flash-latest` (Google's newest Flash model, which the free tier covers); override with `GEMINI_MODEL`. If Gemini is overloaded, Max retries twice before giving up. Each person gets a 30 second cooldown between questions ("bowl break").

Max's full personality sheet lives in [docs/PERSONA.md](docs/PERSONA.md).
