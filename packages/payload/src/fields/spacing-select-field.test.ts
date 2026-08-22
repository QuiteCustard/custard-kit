import { describe, expect, it } from 'vitest'
import { defaultSpacingOptions, spacingSelectField } from './spacing-select-field.js'

describe('spacingSelectField', () => {
  it('carries the name and label it was given', () => {
    const field = spacingSelectField({ name: 'mt', label: 'Margin Top' })

    expect(field.name).toBe('mt')
    expect(field.label).toBe('Margin Top')
    expect(field.type).toBe('select')
  })

  it('keeps its default on the default scale', () => {
    const field = spacingSelectField({ name: 'mt', label: 'Margin Top' })

    expect(field.defaultValue).toBe('4')
    expect(field.options).toHaveLength(defaultSpacingOptions.length)
  })

  it('honours an explicit default that exists in the options', () => {
    expect(spacingSelectField({ name: 'mt', label: 'M', defaultValue: '8' }).defaultValue).toBe('8')
  })

  // A default outside the option list saves an invalid selection - the field would come up showing
  // a value the select cannot offer.
  it('falls back to a custom scale’s own first option', () => {
    const custom = spacingSelectField({
      name: 'mt',
      label: 'M',
      options: [
        { label: 'None', value: '0' },
        { label: 'Some', value: '1' },
      ],
    })

    expect(custom.defaultValue).toBe('0')
  })

  it('falls back when an explicit default is outside a custom scale too', () => {
    const custom = spacingSelectField({
      name: 'mt',
      label: 'M',
      defaultValue: '99',
      options: [{ label: 'None', value: '0' }],
    })

    expect(custom.defaultValue).toBe('0')
  })

  // Payload's `Option` is either a pair or a bare string, and the fallback has to read both.
  it('handles bare-string options', () => {
    expect(spacingSelectField({ name: 'mt', label: 'M', options: ['sm', 'lg'] }).defaultValue).toBe(
      'sm',
    )
    expect(
      spacingSelectField({ name: 'mt', label: 'M', defaultValue: 'lg', options: ['sm', 'lg'] })
        .defaultValue,
    ).toBe('lg')
  })

  it('has no default at all when given no options to pick one from', () => {
    expect(spacingSelectField({ name: 'mt', label: 'M', options: [] }).defaultValue).toBeUndefined()
  })
})

describe('defaultSpacingOptions', () => {
  it('is the Tailwind numeric scale, each entry labelled and valued', () => {
    expect(defaultSpacingOptions.length).toBeGreaterThan(0)

    for (const option of defaultSpacingOptions) {
      expect(typeof option).toBe('object')
      expect(option).toHaveProperty('label')
      expect(option).toHaveProperty('value')
    }
  })
})
