import { describe, expect, it } from 'vitest'
import {
  normaliseDisplay,
  normaliseIGN,
  normaliseSlug,
  normaliseUsernameSlug,
} from './normalise.js'

describe('normaliseSlug', () => {
  it('lowercases, transliterates and hyphenates', () => {
    expect(normaliseSlug('Ünïcode  Näme!')).toBe('unicode-name')
    expect(normaliseSlug('Group Stage')).toBe('group-stage')
    expect(normaliseSlug('Pool A')).toBe('pool-a')
  })

  it('collapses and trims separators', () => {
    expect(normaliseSlug('  spaced   out  ')).toBe('spaced-out')
    expect(normaliseSlug('a--b__c')).toBe('a-b-c')
    expect(normaliseSlug('-leading-and-trailing-')).toBe('leading-and-trailing')
  })

  it('strips characters that have no place in a URL', () => {
    expect(normaliseSlug('name.with.dots')).toBe('namewithdots')
    expect(normaliseSlug('100% real')).toBe('100-real')
  })

  it('folds non-Latin scripts to ASCII', () => {
    expect(normaliseSlug('Ωmega')).toBe('omega')
    expect(normaliseSlug('Привет')).toBe('privet')
    expect(normaliseSlug('Nørse')).toBe('norse')
  })

  it('returns empty for input with nothing slug-safe in it', () => {
    expect(normaliseSlug('😀😀')).toBe('')
    expect(normaliseSlug('')).toBe('')
    expect(normaliseSlug(undefined)).toBe('')
  })
})

describe('normaliseUsernameSlug', () => {
  it('keeps internal dots and underscores, which are URL-safe', () => {
    expect(normaliseUsernameSlug('abc.7')).toBe('abc.7')
    expect(normaliseUsernameSlug('mr.example')).toBe('mr.example')
    expect(normaliseUsernameSlug('d_example')).toBe('d_example')
  })

  it('strips leading and trailing separators', () => {
    expect(normaliseUsernameSlug('name.')).toBe('name')
    expect(normaliseUsernameSlug('name_')).toBe('name')
    expect(normaliseUsernameSlug('.ex.1.')).toBe('ex.1')
  })

  // A slug of "." or ".." would be a path traversal in a profile URL.
  it('cannot produce a dot-only slug', () => {
    expect(normaliseUsernameSlug('.')).toBe('')
    expect(normaliseUsernameSlug('..')).toBe('')
    expect(normaliseUsernameSlug('...')).toBe('')
  })

  it('folds whitespace to a hyphen', () => {
    expect(normaliseUsernameSlug('two words')).toBe('two-words')
  })
})

describe('normaliseDisplay', () => {
  it('transliterates but keeps case and spacing', () => {
    expect(normaliseDisplay('Ünïcode Näme')).toBe('Unicode Name')
    expect(normaliseDisplay('Nørse')).toBe('Norse')
  })

  it('is the comparison form two spellings agree on', () => {
    expect(normaliseDisplay('Ωmega')).toBe(normaliseDisplay('Omega'))
  })
})

describe('normaliseIGN', () => {
  it('strips a clan tag prefix', () => {
    expect(normaliseIGN('TAG | name')).toBe('name')
  })

  it('strips a trailing discriminator', () => {
    expect(normaliseIGN('Nørse #')).toBe('norse')
  })

  it('agrees across transliterations of the same name', () => {
    expect(normaliseIGN('Nørse')).toBe(normaliseIGN('Norse'))
  })
})
