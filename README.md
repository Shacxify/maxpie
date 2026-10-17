# Maxpie

A Discord bot that identifies animals from photos, voiced by **Max Liske**: a burnt-out field ornithologist who knows more about birds than anyone in your server and has never once tucked in a shirt.

> mm. house finch. *Haemorhous mexicanus*. the red's from what he eats, so this guy's eating good. super common, total trash bird, love him.

Max + magpie, the bird famous for collecting shiny things (like your photos).

## Commands

| Command | What it does |
| --- | --- |
| `/identify photo:<image> [location:<text>]` | Max IDs the animal: species, scientific name, confidence, likely region, field notes, conservation status, and a fun fact. Birds also get an ID tip, range and migration notes, a song/call link, and recent eBird sightings near the location you typed. |
| `/askmax question:<text>` | Ask Max anything about birds and wildlife. Ask him how to attract birds and he'll talk you out of playback. |

## How it works

```
Discord ──► /api/interactions (Vercel)
              │  verifies the signature, replies "hold on... where'd i put my binoculars"
              ▼
          waitUntil(...)
              ├─ download the photo (resized to 1568px through Discord's media proxy)
              ├─ Gemini vision call: ID + Max's voice, returned as structured JSON
              ├─ GBIF (name check + IUCN status), Wikipedia (link + thumbnail)
              ├─ birds only: eBird recent sightings, xeno-canto recording
              └─ edits the "hold on..." message into the final embed
```

Discord wants an answer within 3 seconds and a vision call takes longer, so Max posts his loading line right away and the function keeps running in the background to finish the real answer.

| File | Job |
| --- | --- |
| `api/interactions.ts` | The Vercel function Discord talks to |
| `src/persona.ts` | Max's system prompt and canned lines |
| `src/model.ts` | Gemini calls and the identification schema |
| `src/enrich.ts` | GBIF, Wikipedia, eBird, xeno-canto, and geocoding lookups |
| `src/embed.ts` | Turns everything into a Discord embed |
| `src/discord.ts` | Photo download and message editing |
| `src/commands.ts` | Slash command definitions |
| `scripts/register-commands.ts` | Pushes the commands to Discord |

## Setup

1. **Create the Discord app.** At the [Discord Developer Portal](https://discord.com/developers/applications), make a new application named Maxpie. Copy the **Application ID** and **Public Key** from General Information, and the **Bot Token** from the Bot tab.
2. **Invite it.** OAuth2 > URL Generator, scopes `bot` and `applications.commands`, permission **Send Messages** and **Embed Links**. Open the URL and pick your server.
3. **Get API keys.**
   - Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (required)
   - eBird key from [ebird.org/api/keygen](https://ebird.org/api/keygen) (optional, enables nearby sightings)
   - xeno-canto key from your xeno-canto account page (optional, enables song links)
4. **Deploy to Vercel.** Import this repo at [vercel.com/new](https://vercel.com/new) and add the environment variables from `.env.example` (everything except `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`, which are only for step 6).
5. **Point Discord at it.** Back in the Developer Portal, set **Interactions Endpoint URL** to `https://<your-project>.vercel.app/api/interactions` and save. Discord pings it to verify the signature check works.
6. **Register the commands.** Locally:
   ```bash
   npm install
   cp .env.example .env   # fill in DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and your DISCORD_GUILD_ID
   npm run register
   ```
   With `DISCORD_GUILD_ID` set, commands show up on your server right away. Leave it blank to register globally.

### Under-18 members

Set `MAX_PG_MODE=true` and Max's weed jokes become snack jokes ("snack break. back in 30s."). Do this if anyone in the server is under 18, so Discord doesn't flag the bot.

## Location and privacy

Discord strips GPS data from uploaded images, so Max never sees exact coordinates. His "likely region" is a reasoned guess from habitat, plumage, subspecies, and range, plus whatever the user types in, and he keeps it at region level on purpose ("likely coastal NorCal"). When someone types a location, it's geocoded server-side only to look up eBird sightings within 50 km. The coordinates never appear in the reply.

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm run typecheck
```

The model defaults to `gemini-flash-latest` (Google's newest Flash model, which the free tier covers); override with `GEMINI_MODEL`, for example a Pro model for tougher IDs. Each `/identify` is one vision call plus a handful of free API lookups. There's a 30 second per-user cooldown ("bowl break"), which is best effort until it moves into Supabase.

## Roadmap (v2)

- `/lifelist`: each user's collection, stored in Supabase
- Server leaderboard
- `/quiz`: Max posts a mystery bird
- Weekly "rarest find" shoutout
- Cooldown moves to Supabase so it holds across function instances

Max's full personality sheet lives in [docs/PERSONA.md](docs/PERSONA.md).
