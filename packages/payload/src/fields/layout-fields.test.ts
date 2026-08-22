import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { alignmentField, animationField, fullWidthField } from './layout-fields.js'

const optionValues = (field: { options?: unknown }): string[] =>
  Array.isArray(field.options)
    ? field.options.flatMap((option) =>
        isRecord(option) && typeof option.value === 'string' ? [option.value] : [],
      )
    : []

const childNamed = (field: unknown, name: string): Record<string, unknown> | null => {
  if (!isRecord(field) || !Array.isArray(field.fields)) return null

  const child = field.fields.find((entry) => isRecord(entry) && entry.name === name)

  return isRecord(child) ? child : null
}

/** Field unions hide `name` and `fields` behind variants that lack them; read them off the object. */
const props = (field: unknown): Record<string, unknown> => {
  if (!isRecord(field)) throw new Error('expected a field object')

  return field
}

describe('alignmentField', () => {
  it('offers left/center/right and defaults to left', () => {
    const field = alignmentField()

    expect(field.name).toBe('alignment')
    expect(optionValues(field)).toEqual(['left', 'center', 'right'])
    expect(field.defaultValue).toBe('left')
    expect(field.required).toBe(true)
  })
})

describe('fullWidthField', () => {
  it('is a plain checkbox', () => {
    const field = fullWidthField()

    expect(field.type).toBe('checkbox')
    expect(props(field).name).toBe('fullWidth')
  })
})

describe('animationField', () => {
  it('pairs a toggle with the style it gates', () => {
    const field = animationField()

    expect(field.type).toBe('row')
    expect(childNamed(field, 'animate')?.defaultValue).toBe(false)
    expect(childNamed(field, 'animation')?.defaultValue).toBe('fade')
  })

  it('offers the three animation styles', () => {
    const animation = childNamed(animationField(), 'animation')

    expect(optionValues(animation ?? {})).toEqual(['fade', 'rise', 'zoom'])
  })

  it('shows the style only once the toggle is on', () => {
    const animation = childNamed(animationField(), 'animation')
    const condition = isRecord(animation?.admin) ? animation.admin.condition : undefined

    if (typeof condition !== 'function') throw new Error('the style field must be conditional')

    expect(condition({}, { animate: true })).toBe(true)
    expect(condition({}, { animate: false })).toBe(false)
  })
})

// buildConfig sanitises fields IN PLACE - it assigns validate/hooks/access/admin onto the object it
// was handed. A shared constant reused across collections is one object every collection mutates,
// which is why each of these is a factory.
describe('every layout field is freshly built', () => {
  it.each([
    ['alignmentField', alignmentField],
    ['fullWidthField', fullWidthField],
    ['animationField', animationField],
  ])('%s returns a new object each call', (_name, build) => {
    expect(build()).not.toBe(build())
  })

  it('does not leak a mutation from one caller to the next', () => {
    const first = alignmentField()

    first.defaultValue = 'center'

    expect(alignmentField().defaultValue).toBe('left')
  })

  it('gives each caller its own nested field array', () => {
    expect(props(animationField()).fields).not.toBe(props(animationField()).fields)
  })
})
