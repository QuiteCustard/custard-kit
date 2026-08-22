import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { draftVersions } from './collection-versions.js'

/** `versions` may be a bare boolean on a collection, so the object form is narrowed into. */
const config = (maxPerDoc?: number): Record<string, unknown> => {
  const versions = maxPerDoc === undefined ? draftVersions() : draftVersions(maxPerDoc)

  if (!isRecord(versions)) throw new Error('draftVersions must return the object form')

  return versions
}

describe('draftVersions', () => {
  it('is the autosave + schedulePublish shape', () => {
    expect(config()).toMatchObject({
      drafts: { autosave: { interval: 1000 }, schedulePublish: true },
    })
  })

  it('takes the per-doc cap and defaults it', () => {
    expect(config().maxPerDoc).toBe(10)
    expect(config(3).maxPerDoc).toBe(3)
    expect(config(0).maxPerDoc).toBe(0)
  })

  // Shared config objects are mutated in place by buildConfig, so two collections must not receive
  // the same one.
  it('returns a fresh object each call', () => {
    expect(draftVersions()).not.toBe(draftVersions())
    expect(config().drafts).not.toBe(config().drafts)
  })
})
