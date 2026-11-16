// Readers for parsed JSON, which arrives as `unknown`: each narrows one step, so a parser checks
// every field before it reads it instead of asserting the whole body's shape.

import { isRecord } from './is-record.js'

/** `value[key]`, or undefined when `value` is not an object. */
export const field = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined

/** `value` when it is an array, else an empty one. */
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** A number that is neither NaN nor infinite. */
export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** A non-empty string, or null for an empty one or anything else. */
export const filled = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null
