import { isRecord } from '@quitecustard/core/utils/is-record'
/**
 * A relationship field as Payload hands it over: an id at depth 0, the doc once populated, or empty.
 */
export type Relation<T> = number | string | T | null | undefined

/** The value at `key` on a maybe-populated ref, as unknown; undefined for ids and misses. */
const refField = (rel: unknown, key: string): unknown => (isRecord(rel) ? rel[key] : undefined)

/** Pluck the id from a relationship value: an id, a populated doc, or null/undefined. Works for
 *  both numeric (Postgres serial) and string (UUID) primary keys. */
export const relId = (rel: unknown): number | string | null => {
  if (typeof rel === 'number' || typeof rel === 'string') return rel

  const id = refField(rel, 'id')
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/** Narrow a relation to its populated doc (object), or null when it's still an unresolved id. */
export const relDoc = <T extends { id: number | string }>(rel: Relation<T>): T | null =>
  isRecord(rel) ? rel : null

/** The populated docs of a relationship list; rows still held as ids (depth 0) drop out. */
export const relDocs = <T extends { id: number | string }>(
  refs: readonly Relation<T>[] | null | undefined,
): T[] => (refs ?? []).flatMap((ref) => relDoc(ref) ?? [])

/** A list of relationship values as plain ids, tolerant of populate depth; misses drop out. */
export const relIds = (refs: readonly unknown[] | null | undefined): (number | string)[] =>
  (refs ?? []).flatMap((ref) => {
    const id = relId(ref)
    return id != null ? [id] : []
  })

/**
 * A populated doc's display name, or null - for a bare id (depth 0), a missing relation, or a doc
 * with no name there is no name to give. `unknown` on purpose: this is THE narrowing for "name off
 * a maybe-populated ref", so callers never hand-roll the object/cast dance; the fallback ('TBD',
 * '-', …) stays at the call site where the surface decides it.
 */
export const relName = (rel: unknown): string | null => {
  const name = refField(rel, 'name')
  return typeof name === 'string' ? name : null
}

/** An upload relation as `{ id, url }`, or null when it is unpopulated or has no url yet. */
export const resolveMedia = (val: unknown): { id: number | string; url: string } | null => {
  const id = refField(val, 'id')
  const url = refField(val, 'url')
  return (typeof id === 'number' || typeof id === 'string') && typeof url === 'string' && url !== ''
    ? { id, url }
    : null
}
