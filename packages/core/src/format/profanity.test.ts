import { describe, expect, it } from 'vitest'
import { createProfanityChecker } from './profanity.js'

const isProfane = createProfanityChecker()

describe('createProfanityChecker', () => {
  it('passes ordinary names through', () => {
    expect(isProfane('Ada Lovelace')).toBe(false)
    expect(isProfane('')).toBe(false)
    expect(isProfane('mr.example')).toBe(false)
  })

  it('catches the plain word', () => {
    expect(isProfane('shit')).toBe(true)
  })

  // The fold that handles styled Unicode also strips punctuation, so it has to run AFTER the raw
  // pass - folding first turns "sh!t" into "sht", which the matcher doesn't know.
  it('catches punctuation bypasses', () => {
    expect(isProfane('sh!t')).toBe(true)
    expect(isProfane('a$$')).toBe(true)
  })

  it('catches leetspeak bypasses', () => {
    expect(isProfane('f4ck')).toBe(true)
  })

  it('catches separator bypasses', () => {
    expect(isProfane('f u c k')).toBe(true)
    expect(isProfane('f-u-c-k')).toBe(true)
    expect(isProfane('f_u_c_k')).toBe(true)
  })

  it('catches styled Unicode bypasses', () => {
    expect(isProfane('𝐟𝐮𝐜𝐤')).toBe(true)
    expect(isProfane('ｆｕｃｋ')).toBe(true)
  })

  it('exempts an allowed term without unblocking it elsewhere', () => {
    const checker = createProfanityChecker({ allowedTerms: ['analyst'] })

    expect(checker('analyst')).toBe(false)
    expect(checker('Ana Lyst the analyst')).toBe(false)
    expect(checker('Blue Analyst')).toBe(false)
    // The exemption covers the word it names, not the profanity inside another word.
    expect(checker('shitanalyst')).toBe(true)
  })

  it('blocks community terms on top of the dataset', () => {
    const checker = createProfanityChecker({ blockedTerms: ['xyzzy'] })

    expect(checker('xyzzy')).toBe(true)
    expect(checker('x y z z y')).toBe(true)
    expect(isProfane('xyzzy')).toBe(false)
  })

  it('takes word lists as options rather than baking any in', () => {
    const permissive = createProfanityChecker({ allowedTerms: [] })
    const strict = createProfanityChecker({ blockedTerms: ['banana'] })

    expect(permissive('banana')).toBe(false)
    expect(strict('banana')).toBe(true)
  })
})
