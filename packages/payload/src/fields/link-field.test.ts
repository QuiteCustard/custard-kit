import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { linkField } from './link-field.js'

// Payload nests fields inside rows and groups, so reaching one means walking the tree. Everything
// below narrows structurally - the shape is Payload's, not this test's, so it is tested for.
const findField = (fields: unknown, name: string): Record<string, unknown> | null => {
  if (!Array.isArray(fields)) return null

  for (const entry of fields) {
    if (!isRecord(entry)) continue

    if (entry.name === name) return entry

    const nested = findField(entry.fields, name)

    if (nested) return nested
  }

  return null
}

const fieldIn = (root: unknown, name: string) =>
  findField(isRecord(root) ? root.fields : undefined, name)

const optionValues = (field: Record<string, unknown> | null): string[] => {
  if (!field || !Array.isArray(field.options)) return []

  return field.options.flatMap((option) => {
    if (typeof option === 'string') return [option]

    return isRecord(option) && typeof option.value === 'string' ? [option.value] : []
  })
}

const hasValidate = (
  field: unknown,
): field is { validate: (value: unknown) => true | string | undefined } =>
  isRecord(field) && typeof field.validate === 'function'

const hasFilterOptions = (
  field: unknown,
): field is { filterOptions: (args: { id?: number | string }) => unknown } =>
  isRecord(field) && typeof field.filterOptions === 'function'

describe('linkField', () => {
  const base = linkField({ relationTo: ['pages'] })

  it('offers only the types whose collection or component was supplied', () => {
    expect(optionValues(fieldIn(base, 'type'))).toEqual(['reference', 'custom'])
    expect(fieldIn(base, 'dropdown')).toBeNull()
    expect(fieldIn(base, 'phone')).toBeNull()
    expect(fieldIn(base, 'email')).toBeNull()
    expect(fieldIn(base, 'static')).toBeNull()
  })

  it('adds the dropdown type when its collection is supplied', () => {
    const withDropdown = linkField({ relationTo: ['pages'], dropdown: 'menus' })

    expect(optionValues(fieldIn(withDropdown, 'type'))).toContain('dropdown')
    expect(fieldIn(withDropdown, 'dropdown')).not.toBeNull()
  })

  it('adds phone AND email together, since one component serves both', () => {
    const withPhone = linkField({ relationTo: ['pages'], phoneComponent: '@/components/Phone' })

    expect(optionValues(fieldIn(withPhone, 'type'))).toEqual(
      expect.arrayContaining(['phone', 'email']),
    )
    expect(fieldIn(withPhone, 'phone')).not.toBeNull()
    expect(fieldIn(withPhone, 'email')).not.toBeNull()
  })

  it('adds the static type when routes are supplied', () => {
    const withStatic = linkField({
      relationTo: ['pages'],
      staticOptions: [{ label: 'Home', value: '/' }],
    })

    expect(optionValues(fieldIn(withStatic, 'type'))).toContain('static')
    expect(optionValues(fieldIn(withStatic, 'static'))).toEqual(['/'])
  })

  it('validates the custom URL against the protocol allowlist', () => {
    const url = fieldIn(base, 'url')

    if (!hasValidate(url)) throw new Error('the custom URL field must carry a validator')

    expect(url.validate('https://example.test')).toBe(true)
    expect(url.validate('/about')).toBe(true)
    expect(url.validate('#anchor')).toBe(true)
    expect(url.validate('')).toBe('URL required')
    expect(url.validate(null)).toBe('URL required')
    expect(typeof url.validate('javascript:alert(1)')).toBe('string')
  })

  // The open-redirect vector: a browser resolves a leading backslash as scheme-relative, so this
  // has to be refused even though it starts with '/'.
  it.each(['//evil.test', '/\\evil.test', '/\t/evil.test', '/\\/evil.test'])(
    'refuses the off-origin redirect %j',
    (value) => {
      const url = fieldIn(base, 'url')

      if (!hasValidate(url)) throw new Error('the custom URL field must carry a validator')

      expect(url.validate(value)).toBe('Invalid URL')
    },
  )

  // Payload leaves `id` undefined on create, and `not_in: [undefined]` compiles to
  // `id NOT IN (NULL)` - which matches no row, emptying the picker on a new document.
  it('does not empty the dropdown picker on a new document', () => {
    const withDropdown = linkField({ relationTo: ['pages'], dropdown: 'menus' })
    const dropdown = fieldIn(withDropdown, 'dropdown')

    if (!hasFilterOptions(dropdown)) throw new Error('the dropdown field must filter options')

    expect(dropdown.filterOptions({ id: undefined })).toBe(true)
    expect(dropdown.filterOptions({})).toBe(true)
    expect(dropdown.filterOptions({ id: 5 })).toEqual({ id: { not_in: [5] } })
    expect(dropdown.filterOptions({ id: 'a1b2' })).toEqual({ id: { not_in: ['a1b2'] } })
  })

  it('drops the label field when asked', () => {
    expect(fieldIn(base, 'label')).not.toBeNull()
    expect(fieldIn(linkField({ relationTo: ['pages'], disableLabel: true }), 'label')).toBeNull()
  })

  it('localises only the label, leaving the link structure shared', () => {
    const localised = linkField({ relationTo: ['pages'], localizedLabel: true })

    expect(fieldIn(localised, 'label')?.localized).toBe(true)
    expect(fieldIn(localised, 'url')?.localized).toBeUndefined()
  })

  it('derives the style default from the options it was given', () => {
    const styled = linkField({
      relationTo: ['pages'],
      styleOptions: [
        { label: 'Primary', value: 'primary' },
        { label: 'Ghost', value: 'ghost' },
      ],
    })

    expect(fieldIn(styled, 'style')?.defaultValue).toBe('primary')
    expect(fieldIn(base, 'style')).toBeNull()
  })

  it('carries the reference relationTo and maxDepth through', () => {
    const deep = linkField({ relationTo: ['pages', 'posts'], maxDepth: 3 })

    expect(fieldIn(deep, 'reference')?.relationTo).toEqual(['pages', 'posts'])
    expect(fieldIn(deep, 'reference')?.maxDepth).toBe(3)
  })

  it('merges caller overrides over the group it builds', () => {
    const renamed = linkField({ relationTo: ['pages'], overrides: { label: 'Call to action' } })

    const group: unknown = renamed

    if (!isRecord(group)) throw new Error('linkField must return a field object')

    expect(group.label).toBe('Call to action')
    expect(group.name).toBe('link')
  })
})
