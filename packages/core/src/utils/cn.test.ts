import { describe, expect, it } from 'vitest'
import { cn, createCn } from './cn.js'

describe('cn', () => {
  it('joins class names and drops falsy ones', () => {
    expect(cn('a', 'b')).toBe('a b')
    expect(cn('a', false && 'b', null, undefined, '')).toBe('a')
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
  })

  it('resolves a conflict in favour of the last class', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('keeps classes from groups that do not conflict', () => {
    expect(cn('p-2', 'mt-4')).toBe('p-2 mt-4')
  })

  it('is empty for no input', () => {
    expect(cn()).toBe('')
  })
})

describe('createCn', () => {
  // tailwind-merge only knows stock Tailwind. An unregistered custom token is classified by its
  // prefix - a `text-` font size reads as a text COLOUR - and is then dropped the moment it merges
  // against a real one, which is the bug registering the scale prevents.
  it('dedupes a registered custom scale against itself', () => {
    const merge = createCn({
      extend: { classGroups: { 'font-size': [{ text: ['display', 'body'] }] } },
    })

    expect(merge('text-display', 'text-body')).toBe('text-body')
  })

  it('keeps a registered custom size alongside a colour instead of dropping one', () => {
    const merge = createCn({
      extend: { classGroups: { 'font-size': [{ text: ['display'] }] } },
    })

    expect(merge('text-display', 'text-red-500')).toBe('text-display text-red-500')
  })

  it('still merges stock Tailwind', () => {
    const merge = createCn({ extend: { classGroups: { 'font-size': [{ text: ['display'] }] } } })

    expect(merge('p-2', 'p-4')).toBe('p-4')
  })
})
