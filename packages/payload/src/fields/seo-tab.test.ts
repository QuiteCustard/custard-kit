import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { seoTab } from './seo-tab.js'

/** Tab and Field unions hide `name` behind their unnamed variants; read it off the object. */
const props = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error('expected an object')

  return value
}

const fieldNames = (fields: unknown[]): unknown[] =>
  fields.flatMap((field) => (isRecord(field) && field.name ? [field.name] : []))

const named = (fields: unknown[], name: string): Record<string, unknown> | null => {
  const field = fields.find((entry) => isRecord(entry) && entry.name === name)

  return isRecord(field) ? field : null
}

describe('seoTab', () => {
  const tab = seoTab({ imageCollection: 'images' })

  it('is a named tab wired to the meta group', () => {
    expect(props(tab).name).toBe('meta')
    expect(tab.label).toBe('SEO')
  })

  it('carries the title, description and image fields', () => {
    expect(fieldNames(tab.fields)).toEqual(
      expect.arrayContaining(['title', 'description', 'image']),
    )
  })

  it('points the meta image at the collection it was given', () => {
    expect(named(tab.fields, 'image')?.relationTo).toBe('images')
  })

  it('leaves the fields unlocalised by default', () => {
    const fields: unknown[] = tab.fields

    for (const field of fields) {
      if (isRecord(field) && field.name) expect(field.localized).toBeFalsy()
    }
  })

  it('localises the quartet when asked', () => {
    const localised = seoTab({ imageCollection: 'images', localized: true })

    expect(named(localised.fields, 'title')?.localized).toBe(true)
    expect(named(localised.fields, 'description')?.localized).toBe(true)
    expect(named(localised.fields, 'image')?.localized).toBe(true)
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(seoTab({ imageCollection: 'images' })).not.toBe(tab)
  })
})
