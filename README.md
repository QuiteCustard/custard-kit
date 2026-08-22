# custard-kit

Reusable TypeScript helpers, as a pnpm workspace publishing three scoped packages. Each package
exposes one module per file — no barrels — so consumers import exactly what they use:

```ts
import { normaliseSlug } from '@quitecustard/core/format/normalise'
import { relId } from '@quitecustard/payload/documents/resolve-ref'
import { verifyInteractionSignature } from '@quitecustard/services/discord/verify-interaction'
```

## Packages

### `@quitecustard/core`

Framework-free. No peer dependencies.

- `utils/` — sleep, is-record, one-of, numbers, safe-equal, form-data, slug-to-label,
  rgb-to-hex, cn
- `format/` — normalise (transliteration/slug/IGN pipeline), get-initials, ordinal,
  sanitise-text, profanity, date (validity/range/datetime-input helpers +
  locale-aware `formatDate`), amount (locale-aware money formatting)
- `media/` — image-mime, video-mime (magic-byte sniffing)
- `url/` — stream-target (Twitch/YouTube URL parsing), link-protocol (href protocol allowlist for
  author-editable URL fields)

Notes:

- `format/profanity` exports `createProfanityChecker({ allowedTerms, blockedTerms })` — the
  project-specific word lists are constructor options, not baked in.
- `utils/cn` exports plain `cn` (stock Tailwind) and `createCn(config)` for a project whose
  `@theme` block declares custom tokens tailwind-merge would otherwise misclassify.

### `@quitecustard/payload`

Helpers generic over any Payload v3 project. Peer deps: `payload` (required),
`@payloadcms/drizzle` + `drizzle-orm` (optional — only `db/`) and `next` (optional — only
`operations/after-response`).
Payload's module augmentation means the consumer's generated types flow through
`CollectionSlug`-generic helpers automatically.

- `documents/` — relation narrowing, localised reads, the published clause, version config
- `access/` — anyone/nobody, role gates, the self check across Payload's three field-access shapes
- `fields/` — field and admin-config factories: link, hero, owner, SEO tab, colour, phone, height,
  size, spacing, layout, media-content. Ships no UI, so a custom component's path is a required
  parameter rather than a default.
- `db/` — transactions, raw-SQL helpers, sync locking, orphan cleanup, bulk delete, import-provenance
  fields and their indexes. Postgres only.
- `errors/` — the one reader for Payload's per-field messages, duplicate detection, a user-safe message
- `operations/` — autosave-vs-unpublish, ref-counted context flags, deferred work, the job drain,
  unique slugs and usernames

The [package README](packages/payload/README.md#contents) lists each module; every export carries
JSDoc, so an editor shows the detail on hover.

Contracts to know:

- `sync-lock` — `createSyncLock({ slug, table, staleMs })` over a global with `isRunning`,
  `startedBy`, `startedAt` fields; defaults to slug `sync-lock` on table `sync_lock`.
- `sessions` — `appendUserSession` defaults `table` to `users_sessions` (Payload's own naming for
  a `users` collection); pass `table` for any other auth collection slug.
- Everything under `db/` assumes a Postgres adapter built on `@payloadcms/drizzle` —
  `db-postgres` and `db-vercel-postgres` both qualify. Not SQLite or Mongo. Nothing outside `db/`
  imports drizzle. `fields/seo-tab` assumes `@payloadcms/plugin-seo`, and
  `operations/after-response` assumes `next`.
- `role-gate`/`self-access` are generic over the role/id model - a project's own role list (which
  roles exist, which domain each covers) and multi-auth-collection id resolution stay local; only
  the read-a-role-off-a-caller and self-check MECHANISMS are here.
- `link-field`/`media-content-fields` ship no admin UI and no branding - a caller's own brand
  colour presets, block-type Tailwind class maps, and rich-text `editor` config stay local; these
  factories only assemble the field SHAPE around whatever collections/components/presets you pass.

### `@quitecustard/services`

Standalone API clients. Optional peer dep: `@anthropic-ai/sdk` (only `ocr/scan`).
Every credential is a parameter falling back to an environment variable — see the package README
for the full table.

- `discord/` — api, interactions (defer + edit-reply), verify-interaction (Ed25519), oauth, webhook-url
- `steam/` — id (SteamID64), api, openid ("Sign in through Steam")
- `startgg/` — oauth, fetch-start-gg-graphql (rate-limited client), validate-url
- `twitch/` — channel, live-streams (Helix)
- `ocr/` — scan (Claude vision image → structured data; the caller declares the shape)

## Development

```
pnpm install
pnpm -r build        # tsc per package, topological (core first)
pnpm test            # vitest, runs against src so no build is needed
pnpm verify          # build + typecheck + lint + test
```

Tests live beside the modules they cover as `src/**/*.test.ts`, and are excluded from the build so
they never ship.

## Consuming from another project

```
pnpm add @quitecustard/core @quitecustard/payload @quitecustard/services
```

Alternatives:

- **Local link while iterating:** `pnpm link` from the package directory.
- **Git dependency:** `pnpm add "github:QuiteCustard/custard-kit#path:packages/core"` works for
  `core` only — `payload` and `services` depend on `@quitecustard/core` through `workspace:^`, which no
  registry rewrites over a git dep, so the install fails to resolve it.

## Publishing

The three packages publish to the `@quitecustard` npm scope, MIT, public.

```
pnpm -r build         # dist/ is gitignored and files: ["dist"] — build first
pnpm -r publish       # topological: core, then payload and services
```

- `pnpm` (not `npm`) is required: it rewrites the `workspace:^` dependency on `@quitecustard/core` to the
  version being published. `npm publish` ships the literal `workspace:^` and the tarball is broken.
- `pnpm publish` refuses to run on a dirty tree or off `main`/`master`. It does NOT skip a package
  whose version is already on the registry: it retries it, takes a 403 (`cannot publish over the
  previously published versions`) and **aborts the whole run**, so anything after it in the
  topological order never publishes. Bump the version in each package that changed, or publish the
  remainder with `pnpm --filter <pkg> publish`.
- A scoped package is RESTRICTED unless the registry is told otherwise, and a restricted package
  returns 404 to anyone not logged in — indistinguishable from "never published". `publishConfig`
  only applies at publish time, so fix an already-published one with
  `npm access set status=public <pkg>`; no republish or version bump is needed.
- npm requires 2FA on publish; pass `--otp=<code>` or answer the prompt.
- A published `name@version` is permanent. `pnpm -r publish --dry-run` and `pnpm pack` first.

### Versioning

Each module's path is part of the public API, since every file is a subpath export. Adding a file
is a patch or minor; **renaming or removing one is breaking**, the same as deleting an export.
Before 1.0 that is a minor bump and needs no deprecation cycle. After 1.0 it is a major, and the
old path should survive one major as a module that re-exports the new one, marked `@deprecated`.

## Roadmap

Wanted, but each needs work before it can live here:

- Payload collection/global fetch helpers — the usual implementations import `@payload-config`, a
  per-project tsconfig alias that does not resolve from inside node_modules; they need to accept a
  `payload` instance (or config promise) parameter instead.
- Name matching (fuzzy display-name → account resolution) — needs result types that don't lean on a
  consumer's generated `payload-types`.
- A bracket engine (plan / seeding / swiss / round-robin) — pure algorithms, but they need a neutral
  type layer rather than generated doc types.

Anything that encodes one project's own collections or visibility policy stays in that project.
