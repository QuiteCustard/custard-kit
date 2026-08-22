import { describe, expect, it } from 'vitest'
import { resultRows, rowCount } from './sql-result.js'

// node-postgres wraps rows in `{ rows }`; other drivers return a bare array. A conditional UPDATE's
// outcome must not depend on which one today's adapter happens to be.
describe('resultRows', () => {
  it('reads rows across driver shapes', () => {
    expect(resultRows({ rows: [{ id: 1 }] })).toEqual([{ id: 1 }])
    expect(resultRows([{ id: 1 }])).toEqual([{ id: 1 }])
  })

  it('reads an empty result as no rows either way', () => {
    expect(resultRows({ rows: [] })).toEqual([])
    expect(resultRows([])).toEqual([])
  })

  it('reads anything unrecognised as no rows rather than throwing', () => {
    expect(resultRows(null)).toEqual([])
    expect(resultRows(undefined)).toEqual([])
    expect(resultRows('nonsense')).toEqual([])
    expect(resultRows({})).toEqual([])
    expect(resultRows({ rows: 'not an array' })).toEqual([])
  })
})

describe('rowCount', () => {
  it('counts across driver shapes', () => {
    expect(rowCount({ rows: [1, 2, 3] })).toBe(3)
    expect(rowCount([1, 2])).toBe(2)
  })

  // An UPDATE with no RETURNING reports its effect only in `rowCount`, which is exactly the shape
  // the sync lock's claim depends on.
  it('reads a count with no rows returned', () => {
    expect(rowCount({ rowCount: 7 })).toBe(7)
    expect(rowCount({ rowCount: 0 })).toBe(0)
  })

  // node-postgres answers such a write with the array PRESENT and empty, so reading rows first
  // reports 0 affected for a write that changed three - and a conditional UPDATE would read as
  // lost when it won.
  it('prefers the stated count when the rows array is present but empty', () => {
    expect(rowCount({ rows: [], rowCount: 3 })).toBe(3)
    expect(rowCount({ rows: [], rowCount: 0 })).toBe(0)
    expect(rowCount({ rows: [] })).toBe(0)
  })

  it('agrees with the rows when a driver reports both', () => {
    expect(rowCount({ rows: [1, 2], rowCount: 2 })).toBe(2)
  })

  it('reads anything unrecognised as zero rather than throwing', () => {
    expect(rowCount({})).toBe(0)
    expect(rowCount(null)).toBe(0)
    expect(rowCount(undefined)).toBe(0)
    expect(rowCount('nonsense')).toBe(0)
    expect(rowCount({ rowCount: 'many' })).toBe(0)
  })
})
