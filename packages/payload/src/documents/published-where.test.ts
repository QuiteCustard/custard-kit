import { describe, expect, it } from 'vitest'
import { publishedWhere } from './published-where.js'

describe('publishedWhere', () => {
  it('is the published clause', () => {
    expect(publishedWhere).toEqual({ _status: { equals: 'published' } })
  })

  it('spreads into a wider where without losing either side', () => {
    expect({ ...publishedWhere, slug: { equals: 'x' } }).toEqual({
      _status: { equals: 'published' },
      slug: { equals: 'x' },
    })
  })

  it('drops into an `and` array unchanged', () => {
    expect({ and: [publishedWhere, { slug: { equals: 'x' } }] }).toEqual({
      and: [{ _status: { equals: 'published' } }, { slug: { equals: 'x' } }],
    })
  })
})
