import { describe, expect, it } from 'vitest'
import { jsonFormField } from './form-data.js'

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
