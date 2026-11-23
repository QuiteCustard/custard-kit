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

/** Inside a request scope `after` queues the work; `flushAfter` runs it, as the response ending would. */
const runsDeferred = () => {
  const queued: (() => Promise<void>)[] = []
  vi.mocked(after).mockImplementation((task) => {
    if (typeof task === 'function') queued.push(async () => void (await task()))
  })

  return async () => {
    for (const task of queued.splice(0)) await task()
  }
}

const logs: string[] = []
const errors: unknown[] = []
const updates: Record<string, unknown>[] = []
const found: Record<string, unknown>[] = []

/** The write's `req.context` flag as it stood while the write ran. */
const flagDuringWrite: unknown[] = []

const payload = payloadFixture({
  logger: {
    warn: (message: unknown) => logs.push(String(message)),
    error: (...args: unknown[]) => errors.push(args),
  },
  // As Payload's findByID: a missing doc throws NotFound, or reads as null with `disableErrors`.
  findByID: (args: Record<string, unknown>) => {
    found.push(args)
    if (args.id === 404)
      return args.disableErrors ? Promise.resolve(null) : Promise.reject(new Error('Not Found'))

    return Promise.resolve(args.id === 7 ? { url: '/media/crest.png' } : {})
  },
  update: (args: Record<string, unknown>) => {
    updates.push(args)
    const req = args.req
    const context = req && typeof req === 'object' && 'context' in req ? req.context : undefined
    flagDuringWrite.push(
      context && typeof context === 'object' && 'disableHook' in context
        ? context.disableHook
        : undefined,
    )
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
  req?: ReturnType<typeof requestFixture>
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
    req: args.req ?? requestFixture({ payload, context: args.context ?? {} }),
    operation: 'update',
    context: args.context ?? {},
  } as unknown as Parameters<typeof subject>[0])
}

beforeEach(() => {
  logs.length = 0
  errors.length = 0
  updates.length = 0
  found.length = 0
  flagDuringWrite.length = 0
  runsInline()
})

describe('accentColourHook', () => {
  // The trap: inline, the save's transaction is still open and holds this row, so a write without
  // `req` runs on another connection and waits on that lock for good.
  it('inline, writes on the save’s own request with the hook switched off for the write', async () => {
    const req = requestFixture({ payload, context: {} })

    await hook({ ref: 7, req })

    expect(found).toEqual([
      { collection: 'team-images', id: 7, depth: 0, disableErrors: true, req },
    ])
    expect(updates).toEqual([
      { collection: 'teams', id: 1, data: { accentColour: '#1f2937' }, req },
    ])
    expect(flagDuringWrite).toEqual([true])
    expect(req.context.disableHook).toBeUndefined()
  })

  it('deferred, runs after the response on its own transaction', async () => {
    const flush = runsDeferred()

    await hook({ ref: 7 })
    expect(updates).toEqual([])

    await flush()
    expect(found).toEqual([{ collection: 'team-images', id: 7, depth: 0, disableErrors: true }])
    expect(updates).toEqual([
      {
        collection: 'teams',
        id: 1,
        data: { accentColour: '#1f2937' },
        context: { disableHook: true },
      },
    ])
  })

  it('warns, rather than logging a failure, when the image has been deleted', async () => {
    await hook({ ref: 404 })

    expect(updates).toEqual([])
    expect(errors).toEqual([])
    expect(logs).toEqual(['[accentColour] teams#1 no url for team-images#404'])
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
