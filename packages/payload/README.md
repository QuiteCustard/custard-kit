# @quitecustard/payload

Helpers generic over any Payload v3 project. One module per file — no barrels:

```ts
import { relId } from '@quitecustard/payload/documents/resolve-ref'
import { transactionDb } from '@quitecustard/payload/db/transaction-db'
```

## Install

```
pnpm add @quitecustard/payload
```

Every module is a subpath export, so TypeScript needs `moduleResolution` set to `bundler`,
`node16` or `nodenext` — the legacy `node` resolution can't see subpath exports at all.

Peer dependencies: `payload` (required), `@payloadcms/drizzle` + `drizzle-orm` and `next` (optional —
only some modules touch them). Payload's module augmentation means a consumer's generated types
flow through the `CollectionSlug`-generic helpers automatically.

## Contents

Every module is one subpath: `@quitecustard/payload/<folder>/<module>`. There are no barrels, so
the list below doubles as the import paths. Each export carries JSDoc, which is what your editor
shows on hover — this page is the map, not the reference.

### `documents/` — reading what Payload hands back

- `resolve-ref` — `relId` / `relDoc` / `relDocs` / `relIds` / `relName` / `resolveMedia`: relation
  narrowing without casts, tolerant of populate depth and of numeric or uuid ids
- `locale-record` — flattens a `locale: 'all'` read into `Partial<Record<Locale, string>>`
- `published-where` — the published clause, stated once so a bypassing read and the access rule
  cannot drift apart
- `collection-versions` — `draftVersions(maxPerDoc?)`: the autosave + schedulePublish shape

### `access/`

- `anyone` — `anyone` / `anyoneFieldLevel` / `nobody`
- `role-gate` — `hasRole` / `roleGate` / `roleGateFieldLevel`: the mechanism for reading a role off
  a caller. Which roles exist, and what each one may do, stays in the consuming project.
- `self-access` — `isSameUser` / `isSelfFieldLevel` / `selfOrAdminFieldLevel`, across Payload's
  three field-access argument shapes; takes a `getUserId` resolver for a project with more than one
  auth collection

### `fields/` — field and admin-config factories

Every field rendered by a custom component takes that component's import path as a **required**
parameter — pass your own. Each is a factory, never a shared constant: `buildConfig` sanitises field
objects in place, so two collections must not receive one.

- `link-field` — polymorphic link (internal reference, custom URL, optional static route, dropdown,
  phone, email); each type appears only if its collection or component was supplied
- `hero-field` — the image/video/poster banner group, parameterised on the two upload collections
- `owner-field` — a relationship auto-stamped to the creating user, refused on update by field-level
  access rather than by `admin.readOnly`, which Payload never consults on a write
- `seo-tab` — over `@payloadcms/plugin-seo`'s field factories
- `social-url` — `normaliseSocialUrl` (bare host → `https://…`) plus `validateSocialUrl`
- `colour-picker-field`, `colour-options-field`, `phone-field`, `height-field`, `size-field`,
  `spacing-select-field`, `layout-fields`, `media-content-fields`

### `db/` — raw SQL, transactions and bulk operations

Postgres only, and the only folder needing the `@payloadcms/drizzle` + `drizzle-orm` peers.

- `transaction-db` — the drizzle handle bound to an open transaction, so raw SQL commits with the
  local-API writes around it instead of running on a separate connection
- `sessions` — `appendUserSession`: a race-safe INSERT onto an auth collection's session array
- `sync-lock` — `createSyncLock({slug, table, staleMs})`: single-flight locking for a long job, as a
  conditional UPDATE rather than a read-then-write
- `orphan-cleanup` — `findDeletableIds`, with guard rails that refuse rather than return everything
- `delete-many-with-versions` — bulk delete that also purges the version snapshots the FK leaves behind
- `sql-result` — `resultRows` / `rowCount` across driver response shapes
- `external-ref` — provenance fields plus the partial-unique index that lets an importer upsert on
  `(source, id)` instead of duplicating docs on every run, and per-parent slug uniqueness for
  nested trees

### `errors/`

- `field-errors` — the one reader for Payload's per-field error messages
- `is-duplicate-error` — detects a unique-constraint violation in both shapes Payload surfaces it in
- `public-error` — a message safe to show a user, or a fallback for anything that could leak internals

### `operations/` — write-path and job helpers

- `publish-transition` — autosave-vs-unpublish disambiguation, cheap and exact variants
- `suppress-context` — ref-counted `req.context` flags, safe under a bulk operation's shared context
- `after-response` — defer non-critical work past the response, falling back to inline outside a request
- `run-queued-jobs` — drains the Payload job queue, which nothing else does
- `unique-slug`, `unique-username` — collision-free values, each candidate checked exactly

`src/internal/` holds implementation detail and is not importable: `"./internal/*": null` sits ahead
of the wildcard in `exports`.

## Import provenance — `external-ref`

For a collection whose docs can arrive from an external platform as well as being typed by hand: a
product catalogue synced from Stripe or Shopify, a post archive migrated from WordPress or an RSS
feed, an events listing pulled from a ticketing API, a tournament tree imported from a bracket
service.

The doc records which platform it came from and that platform's own id, so the importer upserts on
the pair — a second run corrects the docs it already created instead of creating a duplicate of
each. Hand-made docs set neither field, and no import touches them.

```ts
import {
  externalRefFields,
  externalRefIndex,
  slugPerParentIndex,
} from '@quitecustard/payload/db/external-ref'

export const lessons: CollectionConfig = {
  slug: 'lessons',
  fields: [
    // …your fields
    ...externalRefFields([{ label: 'Stripe', value: 'stripe' }]),
  ],
}

export const lessonsImportIndex = externalRefIndex({ table: 'lessons', prefix: 'lessons' })
export const lessonsSlugIndex = slugPerParentIndex({
  table: 'lessons',
  parent: 'module',
  prefix: 'lessons',
})
```

```ts
// payload.config.ts
db: postgresAdapter({ afterSchemaInit: [lessonsImportIndex, lessonsSlugIndex] })
```

Two hooks, because they answer to different needs and a collection rarely wants both:

- `externalRefIndex` — unique `(externalSource, externalRef)`, partial to imported rows. This is
  what makes the upsert safe under concurrency: without it, two overlapping import runs both find no
  doc for a source id and both create one. Only for a collection carrying `externalRefFields`, since
  it indexes those columns.
- `slugPerParentIndex` — unique `(parent, slug)`. Nothing to do with imports: it's for a tree whose
  slugs legitimately repeat across parents — `getting-started` under every docs section, `lesson-1`
  under every module — and whose lookups always AND on the parent.

Payload's `afterSchemaInit` hooks compose, each wrapping the previous config builder rather than
replacing it, so registering both on one table is safe.

## Contracts to know

- `sync-lock` — `createSyncLock()` expects a global with `isRunning`, `startedBy` and `startedAt`
  fields, defaulting to slug `sync-lock` on table `sync_lock`; pass `{ slug, table, staleMs }` for
  anything else.
- `orphan-cleanup` — `findDeletableIds` reflects foreign keys from `pg_constraint`, so the caller
  names the tables that count as the row's own data via `ignore`. Non-`public` schemas pass
  `{ schema }`.
- `sessions` — `appendUserSession` defaults `table` to `users_sessions`, Payload's own naming for a
  `users` collection; pass `table` for any other auth collection. It is a raw INSERT rather than a
  `payload.update` on purpose — the module header has the FOR UPDATE / FOR KEY SHARE deadlock
  reason.
- Everything under `db/` needs **a Postgres adapter built on `@payloadcms/drizzle`** —
  `@payloadcms/db-postgres` and `@payloadcms/db-vercel-postgres` both qualify, since they differ
  only in the connection driver. They talk to the shared drizzle layer, never to an adapter
  directly. What they can't run on is SQLite or Mongo: the raw SQL uses `pg_constraint`,
  `timestamptz` and data-modifying CTEs. No module outside `db/` imports drizzle at all, so the
  other five folders work on any adapter.
- `fields/seo-tab` assumes `@payloadcms/plugin-seo`, and `operations/after-response` assumes `next`.
  Those two are the only modules touching either peer.

MIT licensed. Source: [custard-kit](https://github.com/QuiteCustard/custard-kit).
