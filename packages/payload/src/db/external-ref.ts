import type { Field } from 'payload'
import type { PostgresSchemaHook } from '@payloadcms/drizzle/postgres'
import { sql } from 'drizzle-orm'
import { uniqueIndex } from 'drizzle-orm/pg-core'

// Import provenance: the fields an importer stamps on a doc, and the indexes its upsert leans on.
// A plain `//` header like this one is stripped from the emitted .d.ts, so anything a consumer
// needs belongs on the exports below (JSDoc emits) or in the package README (npm renders it).

/**
 * Marks a doc as imported from an external platform - a product synced from Stripe, a post migrated
 * from WordPress, an event pulled from a ticketing API - by recording the platform and its own id
 * for the doc, which is what an importer upserts on so a re-run updates rather than duplicates.
 *
 * A sidebar pair, hidden until something sets them, so a hand-made doc offers no dead inputs.
 * `sources` names the platforms this project imports from.
 *
 * ```ts
 * fields: [...externalRefFields([{ label: 'Stripe', value: 'stripe' }]), ...rest]
 * ```
 *
 * Pair them with `externalRefIndex`, which is what makes the upsert safe under concurrency. Writing
 * the fields is the importer's job: attaching a source id to a doc that was made by hand is a
 * repair, and belongs in a script rather than the admin form.
 */
export const externalRefFields = (sources: { label: string; value: string }[]): Field[] => [
  {
    name: 'externalSource',
    type: 'select',
    options: sources,
    admin: {
      position: 'sidebar',
      description: 'Source platform this doc was imported from.',
      condition: (data) => Boolean(data?.externalSource),
    },
  },
  {
    name: 'externalRef',
    label: 'External Ref',
    type: 'text',
    admin: {
      position: 'sidebar',
      description: "The source platform's own id for this doc, stored verbatim.",
      condition: (data) => Boolean(data?.externalSource),
    },
  },
]

type AfterSchemaInitHook = PostgresSchemaHook
type ExtendTable = Parameters<AfterSchemaInitHook>[0]['extendTable']
type ExtraConfig = NonNullable<Parameters<ExtendTable>[0]['extraConfig']>

// Payload's afterSchemaInit hooks compose: each extendTable call wraps the previous config builder
// rather than replacing it, so several hooks may extend one table as long as their keys differ.
const extendWith = (table: string, extraConfig: ExtraConfig): AfterSchemaInitHook => {
  return ({ schema, extendTable }) => {
    extendTable({ table: schema.tables[table], extraConfig })
    return schema
  }
}

/**
 * One imported doc per source id: a unique index on `(externalSource, externalRef)`, partial to the
 * rows that have a source, which is what makes an importer's upsert safe under concurrency.
 *
 * ```ts
 * export const productsExternalRef = externalRefIndex({ table: 'products', prefix: 'products' })
 *
 * postgresAdapter({ afterSchemaInit: [productsExternalRef] })
 * ```
 *
 * For a collection carrying `externalRefFields` - it indexes those two columns.
 */
export const externalRefIndex = ({
  table,
  prefix,
}: {
  /** Physical table name - the collection's `dbName` alias where one is set, not the slug. */
  table: string
  /** Index-name prefix, conventionally the table name. */
  prefix: string
}): AfterSchemaInitHook =>
  extendWith(table, (t) => ({
    externalRefUnique: uniqueIndex(`${prefix}_external_ref_uq`)
      .on(t.externalSource, t.externalRef)
      // Interpolated rather than written out: a `dbName` on the field changes the physical column,
      // and a literal `external_source` here would name a column that isn't there.
      .where(sql`${t.externalSource} IS NOT NULL`),
  }))

/**
 * Slug uniqueness scoped to a parent instead of the whole collection - for a tree whose slugs
 * legitimately repeat across parents (`getting-started` under every docs section, `lesson-1` under
 * every module) and whose lookups always AND on the parent.
 *
 * ```ts
 * export const lessonsSlugPerModule = slugPerParentIndex({
 *   table: 'lessons',
 *   parent: 'module',
 *   prefix: 'lessons',
 * })
 * ```
 *
 * Nothing to do with imports; a collection needing both indexes registers both hooks.
 */
export const slugPerParentIndex = ({
  table,
  parent,
  prefix,
}: {
  /** Physical table name - the collection's `dbName` alias where one is set, not the slug. */
  table: string
  /** Drizzle column prop (the camelCase field name) of the parent relationship. */
  parent: string
  /** Index-name prefix, conventionally the table name. */
  prefix: string
}): AfterSchemaInitHook =>
  extendWith(table, (t) => ({
    slugPerParentUnique: uniqueIndex(`${prefix}_slug_per_parent_uq`).on(t[parent], t.slug),
  }))
