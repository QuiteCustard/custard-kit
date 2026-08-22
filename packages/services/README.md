# @quitecustard/services

Standalone API clients for Discord, Steam, start.gg and Twitch, plus Claude-vision OCR that reads an
image into whatever shape the caller declares.
One module per file — no barrels:

These are deliberately not wrappers around `discord.js` or `@twurple`. Those libraries are built
around a long-lived stateful client with a cache and a gateway connection, which a serverless
function can't keep alive between invocations. Everything here is request-shaped: verify, fetch,
answer, done. If a project needs the gateway — presence, voice, live events — use discord.js
directly rather than extending this package.

```ts
import { verifyInteractionSignature } from '@quitecustard/services/discord/verify-interaction'
import { isSteamID } from '@quitecustard/services/steam/id'
```

## Install

```
pnpm add @quitecustard/services
```

Every module is a subpath export, so TypeScript needs `moduleResolution` set to `bundler`,
`node16` or `nodenext` — the legacy `node` resolution can't see subpath exports at all.

Optional peer dependency: `@anthropic-ai/sdk` (only `ocr/scan` needs it).

## Credentials

Every credential is a parameter that falls back to an environment variable, so the common case needs
no wiring and a caller that has to be explicit — two Discord apps, a key from a secret store, a test
double — can be:

```ts
await getLiveStreams(channels) // reads TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
await getLiveStreams(channels, { clientId, clientSecret }) // explicit wins
```

`process.env` is global to the Node process, so a variable set by the host — Next.js loading
`.env.local`, a platform injecting config — is visible here with nothing to connect. Each module
reads only its own, and at call time rather than import time:

| Variable                                                 | Used by                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `DISCORD_APP_ID`                                         | `discord/interactions`, `discord/oauth`                            |
| `DISCORD_APP_TOKEN`                                      | `discord/oauth` (bot-token calls)                                  |
| `DISCORD_CLIENT_SECRET`                                  | `discord/oauth` (code exchange)                                    |
| `DISCORD_APP_PUBLIC_KEY`                                 | `discord/verify-interaction`                                       |
| `DISCORD_GUILD_IDS`                                      | `discord/oauth` — comma-separated, for multi-guild username sweeps |
| `STARTGG_TOKEN`                                          | `startgg/fetch-start-gg-graphql` (personal access token)           |
| `STARTGG_OAUTH_CLIENT_ID`, `STARTGG_OAUTH_CLIENT_SECRET` | `startgg/oauth`                                                    |
| `STEAM_WEB_API_KEY`                                      | `steam/api`                                                        |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`               | `twitch/live-streams`                                              |

`ocr/scan` is the exception with no fallback at all: its Anthropic key is a required parameter,
since the caller already owns that client's lifetime.

Two caching notes, both keyed so separate credentials can't collide: `twitch/live-streams` caches
its app token per client id, and `discord/verify-interaction` caches the parsed Ed25519 key per key
string. A malformed key is cached as a failure and fails every request closed — but correcting it
takes effect on the next call, because the cache is keyed by the key string rather than held in one
slot. A missing key is never cached at all.

## Contents

- `discord/` — api, interactions (defer + edit-reply), verify-interaction (Ed25519), oauth,
  webhook-url. Serverless-shaped; no gateway connection.
- `steam/` — id (SteamID64), api, openid ("Sign in through Steam"). Pass `verifyAssertion` the
  `expectedReturnTo` you gave `buildAuthUrl`: Steam signs `return_to` but has no idea which relying
  party is entitled to the assertion, so one minted for a different site's callback verifies here
  just as happily without it.
- `startgg/` — oauth, fetch-start-gg-graphql (rate-limited client), validate-url
- `twitch/` — channel, live-streams (Helix)
- `ocr/scan` — reads structured data out of an image with Claude vision. The caller supplies
  `subject` (what a valid image is), `shape` (a JSON skeleton of the result) and `parse`, so the
  result can be any shape at all — a receipt, an ID card, a league table, a form. Throws
  `ImageRejectedError` when the image isn't that thing at all, so an upload can be refused rather
  than silently accepted with no data.

MIT licensed. Source: [custard-kit](https://github.com/QuiteCustard/custard-kit).
