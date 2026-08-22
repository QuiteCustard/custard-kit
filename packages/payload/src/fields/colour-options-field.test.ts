import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { colourOptionsField } from './colour-options-field.js'

const component = '@/components/colour-picker/ColourPicker'

const presetOptions = [
  { label: 'Brand', value: 'brand' },
  { label: 'Muted', value: 'muted' },
]

/** A group union hides `name`/`label` behind its unnamed variant; read them off the object. */
const props = (field: unknown): Record<string, unknown> => {
  if (!isRecord(field)) throw new Error('expected a field object')

  return field
}

const childNamed = (field: { fields?: unknown }, name: string): Record<string, unknown> | null => {
  if (!Array.isArray(field.fields)) return null

  return field.fields.find((child) => isRecord(child) && child.name === name) ?? null
}

const conditionOf = (field: Record<string, unknown> | null) => {
  const condition = isRecord(field?.admin) ? field.admin.condition : undefined

  if (typeof condition !== 'function') throw new Error('expected a conditional field')

  return condition
}

describe('colourOptionsField', () => {
  const field = colourOptionsField({ component, presetOptions })

  it('is a group carrying the switch, the presets and the custom input', () => {
    expect(field.type).toBe('group')
    expect(props(field).name).toBe('clr')
    expect(childNamed(field, 'hasCustom')?.type).toBe('checkbox')
    expect(childNamed(field, 'preset')?.options).toEqual(presetOptions)
    expect(childNamed(field, 'custom')?.type).toBe('text')
  })

  it('names and labels the group as asked', () => {
    const renamed = colourOptionsField({
      component,
      presetOptions,
      name: 'bg',
      label: 'Background',
    })

    expect(props(renamed).name).toBe('bg')
    expect(props(renamed).label).toBe('Background')
  })

  it('wires the custom input to the caller’s component', () => {
    const custom = childNamed(field, 'custom')

    expect(isRecord(custom?.admin) ? custom.admin.components : null).toMatchObject({
      Field: component,
    })
  })

  // The two inputs are mutually exclusive: exactly one is shown for any value of the switch, so
  // there is never both a preset and a custom colour in play.
  it('shows exactly one of preset and custom, whichever way the switch is set', () => {
    const preset = conditionOf(childNamed(field, 'preset'))
    const custom = conditionOf(childNamed(field, 'custom'))

    expect(preset({}, { hasCustom: false })).toBe(true)
    expect(custom({}, { hasCustom: false })).toBe(false)

    expect(preset({}, { hasCustom: true })).toBe(false)
    expect(custom({}, { hasCustom: true })).toBe(true)
  })

  it('defaults the switch to off, so the presets are what a new block offers', () => {
    expect(childNamed(field, 'hasCustom')?.defaultValue).toBe(false)
  })

  it('merges caller overrides over the group', () => {
    const merged = colourOptionsField({
      component,
      presetOptions,
      overrides: { admin: { description: 'Panel colour' } },
    })

    expect(isRecord(merged.admin) ? merged.admin.description : null).toBe('Panel colour')
    expect(props(merged).name).toBe('clr')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(colourOptionsField({ component, presetOptions })).not.toBe(
      colourOptionsField({ component, presetOptions }),
    )
  })
})
