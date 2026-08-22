import { describe, expect, it } from 'vitest'
import { resolveUniqueUsername } from './unique-username.js'
import { payloadFixture } from '@quitecustard/payload/payload.fixture.js'

type CountArgs = { collection: string; where: Record<string, { equals?: unknown }> }

const takenPayload = (...taken: string[]) => {
  const asked: CountArgs[] = []

  const payload = payloadFixture({
    count: (args: CountArgs) => {
      asked.push(args)

      const [clause] = Object.values(args.where)

      return Promise.resolve({ totalDocs: taken.includes(String(clause?.equals)) ? 1 : 0 })
    },
  })

  return { asked, payload }
}

describe('resolveUniqueUsername', () => {
  it('returns the normalised base when it is free', async () => {
    const { payload } = takenPayload()

    await expect(resolveUniqueUsername('Ada Lovelace', payload)).resolves.toBe('ada-lovelace')
  })

  // Normalised, not merely lowercased: the suffix has to attach to a name that is already a valid
  // slug, or the stored username differs from the one that was checked.
  it('keeps the dots a username slug allows', async () => {
    const { payload } = takenPayload()

    await expect(resolveUniqueUsername('mr.Example', payload)).resolves.toBe('mr.example')
  })

  it('suffixes from 1 until one is free', async () => {
    const { payload } = takenPayload('ada', 'ada1')

    await expect(resolveUniqueUsername('Ada', payload)).resolves.toBe('ada2')
  })

  // Each candidate is checked with its own exact-match count: a prefetch capped at N rows goes
  // blind past N matches and can hand back a name that IS taken, failing the create.
  it('asks about one exact candidate at a time', async () => {
    const { asked, payload } = takenPayload('ada')

    await resolveUniqueUsername('Ada', payload)

    expect(asked).toHaveLength(2)
    expect(asked.map((call) => call.where.username?.equals)).toEqual(['ada', 'ada1'])
  })

  it('costs one query in the common case', async () => {
    const { asked, payload } = takenPayload()

    await resolveUniqueUsername('Ada', payload)

    expect(asked).toHaveLength(1)
  })

  it('takes the collection and field as parameters, with nothing baked in', async () => {
    const { asked, payload } = takenPayload()

    await resolveUniqueUsername('Ada', payload, { collection: 'members', field: 'handle' })

    expect(asked[0]?.collection).toBe('members')
    expect(asked[0]?.where.handle?.equals).toBe('ada')
  })

  // Claimed SYNCHRONOUSLY, before the DB probe's await yields, so two parallel allocations can
  // never probe the same candidate and both see it free.
  it('treats a reserved name as taken and records what it hands out', async () => {
    const { payload } = takenPayload()
    const reserved = new Set(['ada'])

    await expect(resolveUniqueUsername('Ada', payload, { reserved })).resolves.toBe('ada1')
    expect(reserved.has('ada1')).toBe(true)
  })

  it('hands parallel allocations different names', async () => {
    const { payload } = takenPayload()
    const reserved = new Set<string>()

    const names = await Promise.all([
      resolveUniqueUsername('Ada', payload, { reserved }),
      resolveUniqueUsername('Ada', payload, { reserved }),
      resolveUniqueUsername('Ada', payload, { reserved }),
    ])

    expect(new Set(names).size).toBe(3)
  })

  // Returning '' would hand back an empty username, and every emoji-only or punctuation-only base
  // would then collide on the same one.
  it('throws when the base has nothing slug-safe in it', async () => {
    const { payload } = takenPayload()

    await expect(resolveUniqueUsername('😀😀', payload)).rejects.toThrow(/Cannot derive a username/)
    await expect(resolveUniqueUsername('...', payload)).rejects.toThrow(/Cannot derive a username/)
    await expect(resolveUniqueUsername('', payload)).rejects.toThrow(/Cannot derive a username/)
  })

  it('does not probe the database for a base it cannot normalise', async () => {
    const { asked, payload } = takenPayload()

    await expect(resolveUniqueUsername('!!!', payload)).rejects.toThrow()
    expect(asked).toHaveLength(0)
  })
})
