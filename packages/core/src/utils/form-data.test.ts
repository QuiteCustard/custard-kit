import { describe, expect, it } from 'vitest'
import { jsonFormField, numberFormField } from './form-data.js'

describe('jsonFormField', () => {
  it('parses a JSON payload', () => {
    expect(jsonFormField('{"a":1}')).toEqual({ a: 1 })
    expect(jsonFormField('[1,2]')).toEqual([1, 2])
    expect(jsonFormField('"text"')).toBe('text')
    expect(jsonFormField('null')).toBeNull()
  })

  // A form field is absent, blank or garbage far more often than it is malformed on purpose, and
  // none of those should throw inside an action.
  it('reads anything unusable as undefined rather than throwing', () => {
    expect(jsonFormField('')).toBeUndefined()
    expect(jsonFormField('   ')).toBeUndefined()
    expect(jsonFormField('not json')).toBeUndefined()
    expect(jsonFormField('{"a":')).toBeUndefined()
    expect(jsonFormField(null)).toBeUndefined()
  })

  // FormData.get returns a File for a file input, which is not JSON in any form.
  it('reads a non-string entry as undefined', () => {
    expect(jsonFormField(new File([], 'x.png'))).toBeUndefined()
  })

  it('reads a value out of a real FormData', () => {
    const form = new FormData()
    form.set('meta', '{"ok":true}')

    expect(jsonFormField(form.get('meta'))).toEqual({ ok: true })
    expect(jsonFormField(form.get('missing'))).toBeUndefined()
  })
})

describe('numberFormField', () => {
  it('reads a whole number', () => {
    expect(numberFormField('42')).toBe(42)
    expect(numberFormField('0')).toBe(0)
    expect(numberFormField('-3')).toBe(-3)
    expect(numberFormField(' 7 ')).toBe(7)
  })

  // The trap: Number('') and Number('  ') are both 0, so a blank hidden input would otherwise read
  // as the id 0 instead of as missing.
  it('reads a blank field as null, not zero', () => {
    expect(numberFormField('')).toBeNull()
    expect(numberFormField('   ')).toBeNull()
    expect(numberFormField(null)).toBeNull()
  })

  it('reads anything that is not a whole number as null', () => {
    expect(numberFormField('1.5')).toBeNull()
    expect(numberFormField('abc')).toBeNull()
    expect(numberFormField('12abc')).toBeNull()
    expect(numberFormField('Infinity')).toBeNull()
    expect(numberFormField(new File([], 'x.png'))).toBeNull()
  })
})
