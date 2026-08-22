import { describe, expect, it } from 'vitest'
import { localeRecord } from './locale-record.js'

describe('localeRecord', () => {
  it('flattens a locale-keyed read', () => {
    expect(localeRecord({ en: 'Hello', fr: 'Bonjour' }, ['en', 'fr'])).toEqual({
      en: 'Hello',
      fr: 'Bonjour',
    })
  })

  it('drops locales the project does not declare', () => {
    expect(localeRecord({ en: 'Hello', xx: 'Nope' }, ['en'])).toEqual({ en: 'Hello' })
  })

  // Payload stores '' for a cleared field, and "which locales have text" should read that as none.
  it('treats an empty string as absent', () => {
    expect(localeRecord({ en: 'Hello', fr: '' }, ['en', 'fr'])).toEqual({ en: 'Hello' })
    expect(localeRecord({ en: '' }, ['en'])).toEqual({})
  })

  it('drops values that are not strings', () => {
    expect(localeRecord({ en: 42 }, ['en'])).toEqual({})
    expect(localeRecord({ en: null, fr: 'Bonjour' }, ['en', 'fr'])).toEqual({ fr: 'Bonjour' })
    expect(localeRecord({ en: { nested: 'x' } }, ['en'])).toEqual({})
  })

  it('handles input that is not an object at all', () => {
    expect(localeRecord(null, ['en'])).toEqual({})
    expect(localeRecord(undefined, ['en'])).toEqual({})
    expect(localeRecord('Hello', ['en'])).toEqual({})
  })

  it('is empty when no locales are declared', () => {
    expect(localeRecord({ en: 'Hello' }, [])).toEqual({})
  })
})
