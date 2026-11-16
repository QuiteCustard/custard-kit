import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accentColourHook, type AccentColourSource } from './accent-colour-hook.js'
import { payloadFixture, requestFixture } from '@quitecustard/payload/payload.fixture.js'

const { after } = await import('next/server.js')

vi.mock('next/server.js', () => ({ after: vi.fn() }))

/** Outside a request scope Next's `after` throws, so the deferred work is awaited inline. */
const runsInline = () => {
  vi.mocked(after).mockImplementation(() => {
    throw new Error('`after` was called outside a request scope')
  })
}

const logs: string[] = []
const updates: unknown[] = []
const found: { collection: string; id: number | string }[] = []

const payload = payloadFixture({
  logger: { warn: (message: unknown) => logs.push(String(message)), error: () => {} },
  findByID: (args: { collection: string; id: number | string }) => {
    found.push({ collection: args.collection, id: args.id })
    return Promise.resolve(args.id === 7 ? { url: '/media/crest.png' } : {})
  },
  update: (args: unknown) => {
    updates.push(args)
    return Promise.resolve({})
  },
})

const source = (ref: unknown, previousRef?: unknown) => (): AccentColourSource => ({
  collection: 'team-images',
  ref,
  previousRef,
})

const hook = (args: {
  ref: unknown
  previousRef?: unknown
  doc?: Record<string, unknown>
  previous?: Record<string, unknown>
  context?: Record<string, unknown>
  extract?: (url: string) => Promise<string | null>
}) => {
  const subject = accentColourHook({
    field: 'accentColour',
    source: source(args.ref, args.previousRef),
    extract: args.extract ?? (() => Promise.resolve('#1f2937')),
  })

  return subject({
    doc: { id: 1, ...args.doc },
    previousDoc: { id: 1, ...args.previous },
    collection: { slug: 'teams' },
    req: requestFixture({ payload, context: args.context ?? {} }),
    operation: 'update',
    context: args.context ?? {},
  } as unknown as Parameters<typeof subject>[0])
}

beforeEach(() => {
  logs.length = 0
  updates.length = 0
  found.length = 0
  runsInline()
})

describe('accentColourHook', () => {
  it('resolves the image url, extracts a colour and writes it back', async () => {
    await hook({ ref: 7 })

    expect(found).toEqual([{ collection: 'team-images', id: 7 }])
    expect(updates).toEqual([
      {
        collection: 'teams',
        id: 1,
        data: { accentColour: '#1f2937' },
        context: { disableHook: true },
      },
    ])
  })

  it('skips the lookup when the relationship already carries a url', async () => {
    const extract = vi.fn(() => Promise.resolve('#abcdef'))
    await hook({ ref: { id: 7, url: '/media/inline.png' }, extract })

    expect(found).toEqual([])
    expect(extract).toHaveBeenCalledWith('/media/inline.png')
  })

  it('does nothing when the document has no picture', async () => {
    await hook({ ref: null })
    expect(updates).toEqual([])
    expect(found).toEqual([])
  })

  it('does nothing when the picture is unchanged and a colour is stored', async () => {
    await hook({ ref: 7, previousRef: 7, doc: { accentColour: '#1f2937' } })
    expect(updates).toEqual([])
  })

  it('still runs when the picture is unchanged but no colour is stored yet', async () => {
    await hook({ ref: 7, previousRef: 7 })
    expect(updates).toHaveLength(1)
  })

  it('does not re-enter on its own write-back', async () => {
    await hook({ ref: 7, context: { disableHook: true } })
    expect(updates).toEqual([])
  })

  it('honours a custom suppression key', async () => {
    const subject = accentColourHook({
      field: 'accentColour',
      source: source(7),
      extract: () => Promise.resolve('#1f2937'),
      suppressContextKey: 'skipColour',
    })

    await subject({
      doc: { id: 1 },
      previousDoc: { id: 1 },
      collection: { slug: 'teams' },
      req: requestFixture({ payload, context: { skipColour: true } }),
      operation: 'update',
      context: { skipColour: true },
    } as unknown as Parameters<typeof subject>[0])

    expect(updates).toEqual([])
  })

  it('warns and writes nothing when no url resolves', async () => {
    await hook({ ref: 9 })

    expect(updates).toEqual([])
    expect(logs).toEqual(['[accentColour] teams#1 no url for team-images#9'])
  })

  it('warns and writes nothing when extraction returns nothing', async () => {
    await hook({ ref: 7, extract: () => Promise.resolve(null) })

    expect(updates).toEqual([])
    expect(logs).toEqual(['[accentColour] teams#1 nothing extracted from /media/crest.png'])
  })
})
