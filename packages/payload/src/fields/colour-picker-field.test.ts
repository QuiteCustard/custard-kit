import { describe, expect, it } from 'vitest'
import { colourPickerComponent, colourPickerField } from './colour-picker-field.js'

describe('colourPickerField', () => {
  it('is a text field rendered by this package’s own picker by default', () => {
    const field = colourPickerField()

    expect(field.type).toBe('text')
    expect(field.name).toBe('colour')
    expect(field.label).toBe('Colour')
    expect(field.admin?.components?.Field).toBe(colourPickerComponent)
  })

  // The path is what Payload's import map resolves: it must name the module's real location and
  // export, or the admin fails at render time rather than at build.
  it('names the module and export that ship the picker', () => {
    expect(colourPickerComponent).toBe('@quitecustard/payload/admin/colour-picker#ColourPicker')
  })

  it('uses a caller’s own component when given one', () => {
    expect(colourPickerField({}, '@/x/Y').admin?.components?.Field).toBe('@/x/Y')
  })

  it('takes name, label and other overrides', () => {
    const field = colourPickerField({ name: 'accent', label: 'Accent', required: true })

    expect(field.name).toBe('accent')
    expect(field.label).toBe('Accent')
    expect(field.required).toBe(true)
  })

  it('keeps the component when the caller supplies its own admin block', () => {
    const field = colourPickerField({ admin: { condition: () => true } })

    expect(field.admin?.components?.Field).toBe(colourPickerComponent)
    expect(typeof field.admin?.condition).toBe('function')
  })

  it('keeps a caller’s other admin components alongside the Field', () => {
    const field = colourPickerField({
      admin: { components: { Label: '@/components/colour-picker/Label' } },
    })

    expect(field.admin?.components?.Field).toBe(colourPickerComponent)
    expect(field.admin?.components?.Label).toBe('@/components/colour-picker/Label')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(colourPickerField()).not.toBe(colourPickerField())
  })
})
