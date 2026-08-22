import { describe, expect, it } from 'vitest'
import { relDoc, relDocs, relId, relIds, relName, resolveMedia } from './resolve-ref.js'

const doc = { id: 7, name: 'Example' }

describe('relId', () => {
  it('plucks an id whether the relation is populated or not', () => {
    expect(relId(7)).toBe(7)
    expect(relId(doc)).toBe(7)
  })

  // Both key shapes: a Postgres serial and a uuid. Coercing a uuid through Number() is the bug
  // findDeletableIds already had to be fixed for, so nothing here narrows to number.
  it('preserves a string id rather than rejecting it', () => {
    expect(relId('a1b2')).toBe('a1b2')
    expect(relId({ id: 'a1b2' })).toBe('a1b2')
  })

  it('is null for anything carrying no id at all', () => {
    expect(relId(null)).toBeNull()
    expect(relId(undefined)).toBeNull()
    expect(relId({})).toBeNull()
    expect(relId({ id: null })).toBeNull()
    expect(relId({ id: { nested: 1 } })).toBeNull()
    expect(relId(true)).toBeNull()
  })
})

describe('relDoc', () => {
  it('narrows to the populated doc only', () => {
    expect(relDoc(doc)).toEqual(doc)
    expect(relDoc(7)).toBeNull()
    expect(relDoc(null)).toBeNull()
    expect(relDoc(undefined)).toBeNull()
  })
})

describe('relDocs', () => {
  it('drops unpopulated entries from a list', () => {
    expect(relDocs([doc, 8, null])).toEqual([doc])
    expect(relDocs([])).toEqual([])
  })

  it('is empty rather than undefined for a missing list', () => {
    expect(relDocs(null)).toEqual([])
    expect(relDocs(undefined)).toEqual([])
  })
})

describe('relIds', () => {
  it('reads a list as plain ids regardless of populate depth', () => {
    expect(relIds([doc, 8, null])).toEqual([7, 8])
    expect(relIds([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('carries uuid ids through alongside numeric ones', () => {
    expect(relIds([{ id: 'a1b2' }, 'c3d4', 5, null])).toEqual(['a1b2', 'c3d4', 5])
  })

  it('is empty rather than undefined for a missing list', () => {
    expect(relIds(undefined)).toEqual([])
    expect(relIds(null)).toEqual([])
  })
})

describe('relName', () => {
  it('reads a name off a populated doc only', () => {
    expect(relName(doc)).toBe('Example')
    expect(relName(7)).toBeNull()
    expect(relName(null)).toBeNull()
    expect(relName({ id: 7 })).toBeNull()
    expect(relName({ id: 7, name: 42 })).toBeNull()
  })
})

describe('resolveMedia', () => {
  // An upload with an id but no url yet renders as a broken image, so both are required.
  it('resolves an upload relation only when it has both id and url', () => {
    expect(resolveMedia({ id: 1, url: '/a.png' })).toEqual({ id: 1, url: '/a.png' })
    expect(resolveMedia({ id: 'a1b2', url: '/a.png' })).toEqual({ id: 'a1b2', url: '/a.png' })
    expect(resolveMedia({ id: 1 })).toBeNull()
    expect(resolveMedia({ id: 1, url: '' })).toBeNull()
    expect(resolveMedia({ url: '/a.png' })).toBeNull()
    expect(resolveMedia(1)).toBeNull()
    expect(resolveMedia(null)).toBeNull()
  })
})
