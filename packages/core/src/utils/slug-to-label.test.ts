import { describe, expect, it } from 'vitest'
import { slugToLabel } from './slug-to-label.js'

describe('slugToLabel', () => {
  it('title-cases each hyphen-separated word', () => {
    expect(slugToLabel('group-stage')).toBe('Group Stage')
    expect(slugToLabel('single')).toBe('Single')
    expect(slugToLabel('a-b-c')).toBe('A B C')
  })

  it('leaves the rest of a word alone', () => {
    expect(slugToLabel('mcdonald-farm')).toBe('Mcdonald Farm')
    expect(slugToLabel('iPhone-case')).toBe('IPhone Case')
  })

  it('handles digits and empty segments without throwing', () => {
    expect(slugToLabel('round-1')).toBe('Round 1')
    expect(slugToLabel('')).toBe('')
    expect(slugToLabel('-leading')).toBe(' Leading')
  })
})
