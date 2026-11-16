import { describe, expect, it } from 'vitest'
import type { TextField } from 'payload'
import { validateLinkField } from './link-url.js'

describe('validateLinkField', () => {
  it('accepts the link shapes an href may hold', () => {
    expect(validateLinkField('https://example.test/page')).toBe(true)
    expect(validateLinkField('/about')).toBe(true)
    expect(validateLinkField('#section')).toBe(true)
    expect(validateLinkField('mailto:hello@example.test')).toBe(true)
  })

  it('refuses a scheme that executes', () => {
    expect(validateLinkField('javascript:alert(1)')).not.toBe(true)
    expect(validateLinkField('data:text/html,x')).not.toBe(true)
  })

  it('passes an empty value, leaving presence to the field', () => {
    expect(validateLinkField('')).toBe(true)
    expect(validateLinkField(null)).toBe(true)
    expect(validateLinkField(undefined)).toBe(true)
  })

  // The trap: Payload calls validate(value, options). A validator whose second parameter means
  // something else would read the options object as that argument - here, as the allowlist - so
  // this one takes the value alone and must stay assignable to a text field's `validate`.
  it('is a text field validate that takes the value alone', () => {
    const field: TextField = { name: 'website', type: 'text', validate: validateLinkField }

    expect(field.validate).toBe(validateLinkField)
    expect(validateLinkField).toHaveLength(1)
  })
})
