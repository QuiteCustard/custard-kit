import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { heroField } from './hero-field.js'

/** A group union hides `name` behind its unnamed variant; read it off the object. */
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

describe('heroField', () => {
  const field = heroField({ imageCollection: 'images', videoCollection: 'videos' })

  it('is a group carrying the switch and its three uploads', () => {
    expect(field.type).toBe('group')
    expect(props(field).name).toBe('hero')
    expect(childNamed(field, 'type')?.type).toBe('select')
    expect(childNamed(field, 'image')?.relationTo).toBe('images')
    expect(childNamed(field, 'video')?.relationTo).toBe('videos')
    expect(childNamed(field, 'poster')?.relationTo).toBe('images')
  })

  // The poster is the video's still, so it belongs to the IMAGE collection - swapping the two is
  // the mistake a single factory exists to prevent.
  it('points the poster at the image collection, not the video one', () => {
    expect(childNamed(field, 'poster')?.relationTo).toBe('images')
  })

  it('shows the image on image, and the video plus its poster on video', () => {
    const image = conditionOf(childNamed(field, 'image'))
    const video = conditionOf(childNamed(field, 'video'))
    const poster = conditionOf(childNamed(field, 'poster'))

    expect(image({}, { type: 'image' })).toBe(true)
    expect(video({}, { type: 'image' })).toBe(false)
    expect(poster({}, { type: 'image' })).toBe(false)

    expect(image({}, { type: 'video' })).toBe(false)
    expect(video({}, { type: 'video' })).toBe(true)
    expect(poster({}, { type: 'video' })).toBe(true)
  })

  it('shows nothing before a media type is chosen', () => {
    for (const name of ['image', 'video', 'poster']) {
      expect(conditionOf(childNamed(field, name))({}, {})).toBe(false)
    }
  })

  it('survives a condition call with no sibling data at all', () => {
    for (const name of ['image', 'video', 'poster']) {
      expect(conditionOf(childNamed(field, name))({}, undefined)).toBe(false)
    }
  })

  it('adds the sizing note only to the fields rendered full-width', () => {
    const noted = heroField({
      imageCollection: 'images',
      videoCollection: 'videos',
      sizingNote: 'At least 1600px wide.',
    })

    const descriptionOf = (name: string) => {
      const admin = childNamed(noted, name)?.admin

      return isRecord(admin) ? admin.description : undefined
    }

    expect(descriptionOf('image')).toBe('At least 1600px wide.')
    expect(descriptionOf('poster')).toBe('At least 1600px wide.')
    expect(descriptionOf('video')).toBeUndefined()
  })

  it('omits the description entirely when no note is given', () => {
    const admin = childNamed(field, 'image')?.admin

    expect(isRecord(admin) && 'description' in admin).toBe(false)
  })

  it('returns a new object each call, since buildConfig sanitises fields in place', () => {
    expect(heroField({ imageCollection: 'images', videoCollection: 'videos' })).not.toBe(field)
  })
})
