import type { BasePayload } from 'payload'
import { sql, type SQL } from 'drizzle-orm'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { resultRows } from './sql-result.js'

// The referencing tables are discovered from pg_constraint at call time, never hard-coded, so a
// collection that starts referencing the target is picked up automatically and keeps those rows
// safe. Only the first column of a composite foreign key is read - Payload's generated schema emits
// none, but a hand-written one might.

type FkRef = { tbl: string; col: string }

const fkTablesReferencing = async (
  payload: BasePayload,
  target: string,
  schema: string,
): Promise<FkRef[]> => {
  const res = await payload.db.drizzle.execute(sql`
    SELECT t.relname AS tbl, a.attname AS col
    FROM pg_constraint con
    JOIN pg_class ft ON ft.oid = con.confrelid
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = con.conkey[1]
    WHERE n.nspname = ${schema} AND con.contype = 'f' AND ft.relname = ${target}`)

  return resultRows(res).flatMap((row) => {
    if (!isRecord(row)) return []

    return typeof row.tbl === 'string' && typeof row.col === 'string'
      ? [{ tbl: row.tbl, col: row.col }]
      : []
  })
}

const idsFrom = (rows: unknown[]): (number | string)[] =>
  rows.flatMap((row) => {
    if (!isRecord(row)) return []

    return typeof row.id === 'number' || typeof row.id === 'string' ? [row.id] : []
  })

/** What counts as the row's own data, and where to look for the tables. */
export type OrphanScanOptions = {
  /**
   * Tables that count as the row's OWN data rather than a reference to it: its array and
   * relationship child tables, its search-index rows. Everything else pointing at the row keeps it.
   */
  ignore?: ReadonlySet<string>
  /** An extra predicate ANDed onto the scan, e.g. ``sql`AND base.archived_at IS NULL` ``. */
  extra?: SQL
  /** Postgres schema holding the tables. Defaults to `public`. */
  schema?: string
}

/**
 * Ids of rows in `table` that nothing outside their own data still references - what a bulk delete
 * leaves dangling.
 *
 * ```ts
 * const ids = await findDeletableIds(payload, 'authors', {
 *   ignore: new Set(['authors_socials', 'authors_rels']),
 * })
 * ```
 *
 * Ids come back ascending, as whatever type the column holds - integer or uuid.
 *
 * Two refusals stand in front of the result, because callers delete straight from it: an EMPTY
 * reflection means a broken query or the wrong database rather than "nothing references this
 * table", and a run that keeps NOTHING means every guard rail missed. Either would hand back the
 * whole table.
 */
export const findDeletableIds = async (
  payload: BasePayload,
  table: string,
  { ignore, extra = sql``, schema = 'public' }: OrphanScanOptions = {},
): Promise<(number | string)[]> => {
  const allRefs = await fkTablesReferencing(payload, table, schema)

  if (allRefs.length === 0)
    throw new Error(`No foreign key references "${table}" - refusing to mark any row deletable.`)

  const refs = allRefs.filter((r) => !ignore?.has(r.tbl))

  // Checked AFTER the ignore filter, not just before it: an `ignore` covering every referrer leaves
  // no NOT EXISTS clauses at all, and the scan degrades to `WHERE 1 = 1` plus whatever `extra` says.
  // The all-rows-deletable refusal below does not catch that, because a narrowing `extra` keeps the
  // count under the table total.
  if (refs.length === 0)
    throw new Error(
      `Every table referencing "${table}" is in \`ignore\` - refusing, the scan has nothing left to prove a row is unreferenced.`,
    )

  const qualified = (name: string) => sql.raw(`"${schema}"."${name}"`)

  const notExists = refs.map(
    (r) =>
      sql`AND NOT EXISTS (SELECT 1 FROM ${qualified(r.tbl)} x WHERE x.${sql.raw(`"${r.col}"`)} = base.id)`,
  )

  const res = await payload.db.drizzle.execute(
    sql`SELECT base.id FROM ${qualified(table)} base WHERE 1 = 1 ${sql.join(notExists, sql` `)} ${extra} ORDER BY base.id`,
  )

  const ids = idsFrom(resultRows(res))

  const totals = await payload.db.drizzle.execute(
    sql`SELECT count(*)::int AS total FROM ${qualified(table)}`,
  )

  const totalRow = resultRows(totals)[0]
  const total = isRecord(totalRow) && typeof totalRow.total === 'number' ? totalRow.total : 0

  if (ids.length > 0 && ids.length === total)
    throw new Error(
      `Every row of "${table}" (${total}) came back deletable - refusing, the guard rails matched nothing.`,
    )

  return ids
}
