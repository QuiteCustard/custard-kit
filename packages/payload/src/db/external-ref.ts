import type { Field, FieldAccess } from 'payload'
import type { PostgresSchemaHook } from '@payloadcms/drizzle/postgres'
import { sql } from 'drizzle-orm'
import { isRecord } from '@quitecustard/core/utils/is-record'
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
 *
 * `access` is field-level access for both fields. Set `update` wherever the collection lets a
 * non-staff owner edit the doc: re-pointing provenance would hand them a synced doc, or break the
 * importer's upsert key.
 */
export const externalRefFields = (
  sources: { label: string; value: string }[],
  { access }: { access?: { create?: FieldAccess; read?: FieldAccess; update?: FieldAccess } } = {},
): Field[] => [
  {
    name: 'externalSource',
    type: 'select',
    options: sources,
    ...(access ? { access } : {}),
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
    ...(access ? { access } : {}),
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

const plainIdentifier = /^[a-z_][a-z0-9_]*$/

// The column's PHYSICAL name, read off the column rather than written out: a `dbName` on the field
// changes it, and a literal `external_source` would then name a column that isn't there.
//
// Rendered bare, not by interpolating the column object. Interpolation emits `"table"."column"`,
// and the predicate's text is stored verbatim in the migration snapshot - so the two spellings of
// one index read as a schema change, and the index is dropped and recreated. A name that needs
// quoting to be valid still gets it.
const columnName = (column: unknown) => {
  const name = isRecord(column) && typeof column.name === 'string' ? column.name : ''

  if (!name) throw new Error('externalRefIndex: the table has no externalSource column')

  return plainIdentifier.test(name) ? sql.raw(name) : sql.identifier(name)
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
      .where(sql`${columnName(t.externalSource)} IS NOT NULL`),
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
