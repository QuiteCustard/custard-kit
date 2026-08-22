import { describe, expect, it } from 'vitest'
import { colourPickerField } from './colour-picker-field.js'

const component = '@/components/colour-picker/ColourPicker'

describe('colourPickerField', () => {
  it('is a text field wired to the caller’s admin component', () => {
    const field = colourPickerField(component)

    expect(field.type).toBe('text')
    expect(field.name).toBe('colour')
    expect(field.label).toBe('Colour')
    expect(field.admin?.components?.Field).toBe(component)
  })

  // This package ships no UI, so the component path is required rather than defaulted - a default
  // would resolve to nothing in the consumer's app and fail at admin render time.
  it('uses whatever component path it was given', () => {
    expect(colourPickerField('@/x/Y').admin?.components?.Field).toBe('@/x/Y')
  })

  it('takes name, label and other overrides', () => {
    const field = colourPickerField(component, { name: 'accent', label: 'Accent', required: true })

    expect(field.name).toBe('accent')
    expect(field.label).toBe('Accent')
    expect(field.required).toBe(true)
  })

  it('keeps the component when the caller supplies its own admin block', () => {
    const field = colourPickerField(component, { admin: { condition: () => true } })

    expect(field.admin?.components?.Field).toBe(component)
    expect(typeof field.admin?.condition).toBe('function')
  })

  it('keeps a caller’s other admin components alongside the Field', () => {
    const field = colourPickerField(component, {
      admin: { components: { Label: '@/components/colour-picker/Label' } },
    })

    expect(field.admin?.components?.Field).toBe(component)
    expect(field.admin?.components?.Label).toBe('@/components/colour-picker/Label')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(colourPickerField(component)).not.toBe(colourPickerField(component))
  })
})
