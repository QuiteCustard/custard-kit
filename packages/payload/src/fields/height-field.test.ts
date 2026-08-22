import { describe, expect, it } from 'vitest'
import { heightField } from './height-field.js'

const component = '@/components/height-input/HeightInput'

describe('heightField', () => {
  it('is a number field wired to the caller’s admin component', () => {
    const field = heightField(component)

    expect(field.type).toBe('number')
    expect(field.name).toBe('height')
    expect(field.label).toBe('Height (%)')
    expect(field.admin?.components?.Field).toBe(component)
  })

  it('takes overrides, including a min/max range', () => {
    const field = heightField(component, { name: 'h', label: 'H', min: 0, max: 100 })

    expect(field.name).toBe('h')
    expect(field.min).toBe(0)
    expect(field.max).toBe(100)
  })

  it('keeps the component when the caller supplies its own admin block', () => {
    const field = heightField(component, { admin: { description: 'Percent of viewport' } })

    expect(field.admin?.components?.Field).toBe(component)
    expect(field.admin?.description).toBe('Percent of viewport')
  })

  it('keeps a caller’s other admin components alongside the Field', () => {
    const field = heightField(component, {
      admin: { components: { Label: '@/components/height-input/Label' } },
    })

    expect(field.admin?.components?.Field).toBe(component)
    expect(field.admin?.components?.Label).toBe('@/components/height-input/Label')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(heightField(component)).not.toBe(heightField(component))
  })
})
