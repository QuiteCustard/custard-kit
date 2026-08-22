import { describe, expect, it } from 'vitest'
import { phoneField } from './phone-field.js'

const component = '@/components/phone/Phone'

describe('phoneField', () => {
  it('is a text field wired to the caller’s admin component', () => {
    const field = phoneField(component)

    expect(field.type).toBe('text')
    expect(field.name).toBe('phone')
    expect(field.label).toBe('Phone')
    expect(field.admin?.components?.Field).toBe(component)
  })

  it('takes name and label overrides', () => {
    const field = phoneField(component, { name: 'mobile', label: 'Mobile' })

    expect(field.name).toBe('mobile')
    expect(field.label).toBe('Mobile')
  })

  it('carries other overrides through', () => {
    const field = phoneField(component, { name: 'phone', required: true })

    expect(field.required).toBe(true)
  })

  // The component path is the whole reason the factory exists, so an override must not be able to
  // replace it by supplying its own admin block.
  it('keeps the component when the caller supplies its own admin block', () => {
    const field = phoneField(component, { name: 'phone', admin: { description: 'With area code' } })

    expect(field.admin?.components?.Field).toBe(component)
    expect(field.admin?.description).toBe('With area code')
  })

  // Replacing the whole `components` object would silently drop a caller's Cell or Label.
  it('keeps a caller’s other admin components alongside the Field', () => {
    const field = phoneField(component, {
      name: 'phone',
      admin: { components: { Label: '@/components/phone/Label' } },
    })

    expect(field.admin?.components?.Field).toBe(component)
    expect(field.admin?.components?.Label).toBe('@/components/phone/Label')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(phoneField(component)).not.toBe(phoneField(component))
  })
})
