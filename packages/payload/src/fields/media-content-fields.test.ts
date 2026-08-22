import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { mediaContentFields, mediaContentGroupField } from './media-content-fields.js'
import { conditionContext } from '@quitecustard/payload/payload.fixture.js'

// The editor is opaque to this factory - it is threaded through to the richText field untouched.
const editor = { name: 'stub-editor' }

const options = { editor, imageCollection: 'images', videoCollection: 'videos' } as Parameters<
  typeof mediaContentFields
>[0]

const named = (fields: unknown[], name: string): Record<string, unknown> | null => {
  const field = fields.find((entry) => isRecord(entry) && entry.name === name)

  return isRecord(field) ? field : null
}

/**
 * Payload types an admin `condition` as always receiving sibling data, but these fields destructure
 * it with a default - the defence has to be exercisable, so the condition is narrowed to a
 * signature that accepts whatever the test hands it.
 */
const isCondition = (
  value: unknown,
): value is (data: unknown, siblingData: unknown, context: unknown) => unknown =>
  typeof value === 'function'

const conditionOf = (field: Record<string, unknown> | null) => {
  const condition = isRecord(field?.admin) ? field.admin.condition : undefined

  if (!isCondition(condition)) throw new Error('expected a conditional field')

  return (data: unknown, siblingData: unknown) => condition(data, siblingData, conditionContext)
}

describe('mediaContentFields', () => {
  const fields = mediaContentFields(options)

  it('carries the WYSIWYG toggle, its body and the media picker', () => {
    expect(named(fields, 'hasWysiwyg')?.type).toBe('checkbox')
    expect(named(fields, 'wysiwyg')?.type).toBe('richText')
    expect(named(fields, 'type')?.type).toBe('select')
  })

  it('threads the caller’s editor into the rich-text field', () => {
    expect(named(fields, 'wysiwyg')?.editor).toBe(editor)
  })

  it('drops the media picker entirely when asked', () => {
    const textOnly = mediaContentFields({ ...options, disableMedia: true })

    expect(named(textOnly, 'hasWysiwyg')).not.toBeNull()
    expect(named(textOnly, 'type')).toBeNull()
    expect(named(textOnly, 'image')).toBeNull()
    expect(named(textOnly, 'images')).toBeNull()
  })

  it('shows exactly one media input per type', () => {
    const show = (name: string, type: string) => conditionOf(named(fields, name))({}, { type })

    expect([show('image', 'image'), show('video', 'image'), show('images', 'image')]).toEqual([
      true,
      false,
      false,
    ])
    expect([show('image', 'video'), show('video', 'video'), show('poster', 'video')]).toEqual([
      false,
      true,
      true,
    ])
    expect([show('image', 'slideshow'), show('images', 'slideshow')]).toEqual([false, true])
  })

  // Every condition defaults its sibling data, so none of them throws when called without any. One
  // that forgot would take down only the surface that renders it, which is why this sweeps them all
  // rather than naming one.
  it('survives every condition being called with no sibling data', () => {
    for (const field of fields) {
      if (!isRecord(field) || !isRecord(field.admin)) continue

      const { condition } = field.admin

      if (!isCondition(condition)) continue

      expect(() => condition({}, undefined, conditionContext)).not.toThrow()
    }
  })

  it('gates the overlay on the WYSIWYG toggle', () => {
    const overlay = conditionOf(named(fields, 'overlay'))

    expect(overlay({}, { hasWysiwyg: true })).toBe(true)
    expect(overlay({}, { hasWysiwyg: false })).toBe(false)
  })

  it('requires at least two images for a slideshow to be one', () => {
    expect(named(fields, 'images')?.minRows).toBe(2)
  })

  it('points each upload at the collection it was given', () => {
    expect(named(fields, 'image')?.relationTo).toBe('images')
    expect(named(fields, 'video')?.relationTo).toBe('videos')
    expect(named(fields, 'poster')?.relationTo).toBe('images')
  })
})

describe('mediaContentGroupField', () => {
  it('wraps the same fields in an unlabelled group', () => {
    const group = mediaContentGroupField(options)

    expect(group.type).toBe('group')
    expect(group.label).toBe(false)
    expect(named(group.fields, 'hasWysiwyg')).not.toBeNull()
  })

  it('merges caller overrides over the group', () => {
    const group: Record<string, unknown> = mediaContentGroupField({
      ...options,
      overrides: { name: 'body' },
    })

    expect(group.name).toBe('body')
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(mediaContentGroupField(options)).not.toBe(mediaContentGroupField(options))
  })
})
