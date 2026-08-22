import { describe, expect, it } from 'vitest'
import { normaliseUsernameSlug } from '@quitecustard/core/format/normalise'
import { uniqueSuffixedSlug } from './unique-slug.js'

const taken =
  (...slugs: string[]) =>
  (slug: string) =>
    slugs.includes(slug)

describe('uniqueSuffixedSlug', () => {
  it('returns the base slug when it is free', async () => {
    await expect(uniqueSuffixedSlug('Team Name', taken())).resolves.toBe('team-name')
  })

  it('suffixes from 2 until one is free', async () => {
    await expect(uniqueSuffixedSlug('Team Name', taken('team-name'))).resolves.toBe('team-name-2')
    await expect(uniqueSuffixedSlug('Team Name', taken('team-name', 'team-name-2'))).resolves.toBe(
      'team-name-3',
    )
  })

  it('awaits an async check', async () => {
    await expect(
      uniqueSuffixedSlug('Team Name', async (slug) => slug === 'team-name'),
    ).resolves.toBe('team-name-2')
  })

  it('asks about each candidate in order, and stops at the first free one', async () => {
    const asked: string[] = []

    const result = await uniqueSuffixedSlug('Team Name', (slug) => {
      asked.push(slug)
      return asked.length < 3
    })

    expect(asked).toEqual(['team-name', 'team-name-2', 'team-name-3'])
    expect(result).toBe('team-name-3')
  })

  it('takes a different normaliser, so username dots survive the suffixing', async () => {
    await expect(
      uniqueSuffixedSlug('mr.example', taken('mr.example'), normaliseUsernameSlug),
    ).resolves.toBe('mr.example-2')
  })

  // Returning '' would hand back an empty slug as though it were a valid one, and every later row
  // would collide with it.
  it('throws when the base has nothing slug-safe in it', async () => {
    await expect(uniqueSuffixedSlug('😀😀', taken())).rejects.toThrow(/Cannot derive a slug/)
    await expect(uniqueSuffixedSlug('', taken())).rejects.toThrow(/Cannot derive a slug/)
    await expect(uniqueSuffixedSlug('   ', taken())).rejects.toThrow(/Cannot derive a slug/)
  })
})
