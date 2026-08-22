import { describe, expect, it } from 'vitest'
import { PgDialect, getTableConfig, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { externalRefFields, externalRefIndex, slugPerParentIndex } from './external-ref.js'
import { conditionContext } from '@quitecustard/payload/payload.fixture.js'

// Built fresh per table: drizzle consumes a column builder when a table is declared, so sharing one
// object between two pgTable calls corrupts the second.
const buildColumns = (sourceColumn = 'external_source') => ({
  id: integer('id'),
  slug: text('slug'),
  externalSource: text(sourceColumn),
  externalRef: text('external_ref'),
  module: integer('module_id'),
})

type Columns = ReturnType<typeof buildColumns>
type Hook = ReturnType<typeof externalRefIndex>

/** Field unions hide `name`/`options` behind variants that lack them; read them off the object. */
const props = (field: unknown): Record<string, unknown> => {
  if (!isRecord(field)) throw new Error('expected a field object')

  return field
}

/**
 * Runs a hook the way Payload's adapter does and hands back the `extraConfig` it produced. The
 * adapter argument carries the whole Postgres adapter, none of which these hooks read, so the
 * literal is reshaped once here.
 */
const extraConfigFrom = (hook: Hook, table: string, columns: Columns) => {
  let captured: ((cols: Columns) => unknown) | null = null

  const schema = { tables: { [table]: pgTable(table, columns) } }

  hook({
    schema,
    extendTable: (args: unknown) => {
      if (isRecord(args) && typeof args.extraConfig === 'function') {
        const build = args.extraConfig

        captured = (cols) => build(cols)
      }

      return schema.tables[table]
    },
  } as unknown as Parameters<Hook>[0])

  if (!captured) throw new Error('the hook must call extendTable with an extraConfig')

  return captured
}

/**
 * The indexes drizzle actually emits for the hook's config, rather than the builder object that
 * describes them.
 */
const indexesFrom = (hook: Hook, table = 'products') =>
  getTableConfig(pgTable(table, buildColumns(), extraConfigFrom(hook, table, buildColumns())))
    .indexes

/** An indexed entry's physical column name; an entry may also be a raw SQL expression. */
const columnNames = (columns: unknown): string[] => {
  if (!Array.isArray(columns)) return []

  return columns.flatMap((column: unknown) =>
    isRecord(column) && typeof column.name === 'string' ? [column.name] : [],
  )
}

/**
 * Payload types an admin `condition` as always receiving data, but several of these fields
 * destructure with a default - the defence has to be exercisable, so the condition is narrowed to
 * a signature that accepts whatever the test wants to hand it.
 */
const isCondition = (
  value: unknown,
): value is (data: unknown, siblingData: unknown, context: unknown) => unknown =>
  typeof value === 'function'

describe('externalRefFields', () => {
  const fields = externalRefFields([{ label: 'Stripe', value: 'stripe' }])

  it('is the source/ref pair, in the sidebar', () => {
    expect(fields.map((field) => props(field).name)).toEqual(['externalSource', 'externalRef'])

    for (const field of fields) {
      expect(isRecord(field.admin) ? field.admin.position : null).toBe('sidebar')
    }
  })

  it('offers exactly the sources it was given, with none baked in', () => {
    expect(props(fields[0]).options).toEqual([{ label: 'Stripe', value: 'stripe' }])
    expect(externalRefFields([])[0]?.type).toBe('select')
  })

  // Hidden until something sets them, so a hand-made doc offers no dead inputs.
  it('hides both until a source is set', () => {
    for (const field of fields) {
      const condition = isRecord(field.admin) ? field.admin.condition : undefined

      if (!isCondition(condition)) throw new Error('both fields must be conditional')

      expect(condition({ externalSource: 'stripe' }, {}, conditionContext)).toBe(true)
      expect(condition({}, {}, conditionContext)).toBe(false)
      expect(condition(undefined, {}, conditionContext)).toBe(false)
    }
  })
})

describe('externalRefIndex', () => {
  const indexes = indexesFrom(externalRefIndex({ table: 'products', prefix: 'products' }))

  it('is a unique index on the source/ref pair', () => {
    expect(indexes).toHaveLength(1)
    expect(indexes[0]?.config.name).toBe('products_external_ref_uq')
    expect(indexes[0]?.config.unique).toBe(true)
    expect(columnNames(indexes[0]?.config.columns)).toEqual(['external_source', 'external_ref'])
  })

  // Partial to the rows that have a source: without the predicate every hand-made doc would share
  // the (NULL, NULL) pair and only one could exist.
  it('is partial to the rows carrying a source', () => {
    expect(indexes[0]?.config.where).toBeDefined()
  })

  // The predicate interpolates the column rather than naming it, so a `dbName` on the field cannot
  // leave it pointing at a column that is not there.
  it('names the physical column through drizzle, not as a literal', () => {
    const hook = externalRefIndex({ table: 'products', prefix: 'products' })
    const extraConfig = extraConfigFrom(hook, 'products', buildColumns('ext_src'))
    const renamed = pgTable('products', buildColumns('ext_src'), extraConfig)
    const { where } = getTableConfig(renamed).indexes[0]?.config ?? {}

    if (!where) throw new Error('the index must carry a predicate')

    const rendered = new PgDialect().sqlToQuery(where).sql

    expect(rendered).toContain('ext_src')
    expect(rendered).not.toContain('external_source')
  })
})

describe('slugPerParentIndex', () => {
  const indexes = indexesFrom(
    slugPerParentIndex({ table: 'lessons', parent: 'module', prefix: 'lessons' }),
    'lessons',
  )

  it('is a unique index on the parent/slug pair', () => {
    expect(indexes[0]?.config.name).toBe('lessons_slug_per_parent_uq')
    expect(indexes[0]?.config.unique).toBe(true)
    expect(columnNames(indexes[0]?.config.columns)).toEqual(['module_id', 'slug'])
  })

  // Scoped to a parent, so the same slug may repeat under different parents - which is the whole
  // reason this exists rather than a plain unique on slug.
  it('carries no predicate, since every row participates', () => {
    expect(indexes[0]?.config.where).toBeUndefined()
  })
})

// The hooks compose: each extendTable call wraps the previous config builder rather than replacing
// it, so a collection needing both indexes can register both.
describe('composing both hooks on one table', () => {
  it('keeps the index names distinct', () => {
    const external = externalRefIndex({ table: 'lessons', prefix: 'lessons' })
    const perParent = slugPerParentIndex({ table: 'lessons', parent: 'module', prefix: 'lessons' })

    const names = [
      indexesFrom(external, 'lessons')[0]?.config.name,
      indexesFrom(perParent, 'lessons')[0]?.config.name,
    ]

    expect(new Set(names).size).toBe(2)
  })
})
