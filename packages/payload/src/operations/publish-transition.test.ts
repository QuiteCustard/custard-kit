import { describe, expect, it } from 'vitest'
import {
  isCurrentlyPublished,
  isDraftSaveNotUnpublish,
  looksLikeAutosaveTick,
} from './publish-transition.js'
import { payloadFixture, requestFixture } from '@quitecustard/payload/payload.fixture.js'

const draft = { id: 1, _status: 'draft' }
const published = { id: 1, _status: 'published' }

describe('looksLikeAutosaveTick', () => {
  // The admin PATCHes ?autosave=true&draft=true, and those flags are all this cheap check has.
  it('reads the admin autosave flags', () => {
    expect(looksLikeAutosaveTick(requestFixture({ query: { autosave: 'true' } }), draft)).toBe(true)
    expect(looksLikeAutosaveTick(requestFixture({ query: { draft: 'true' } }), draft)).toBe(true)
    expect(looksLikeAutosaveTick(requestFixture({ query: { autosave: true } }), draft)).toBe(true)
  })

  // Publishing is never ambiguous, so it short-circuits before the flags are even read.
  it('is false whenever the doc is being published', () => {
    expect(looksLikeAutosaveTick(requestFixture({ query: { autosave: 'true' } }), published)).toBe(
      false,
    )
  })

  it('is false without the flags', () => {
    expect(looksLikeAutosaveTick(requestFixture({}), draft)).toBe(false)
    expect(looksLikeAutosaveTick(requestFixture({ query: {} }), draft)).toBe(false)
    expect(looksLikeAutosaveTick(requestFixture({ query: { autosave: 'false' } }), draft)).toBe(
      false,
    )
    expect(looksLikeAutosaveTick(requestFixture({ query: { autosave: '1' } }), draft)).toBe(false)
  })

  // `createLocalReq` never sets `autosave` or `draft` (it adds only `depth`), and those flags are
  // all this reads - so a Local API draft save always reads as a real transition here. That is the
  // limitation the async check below exists to remove.
  it('reads a Local API draft save as a real transition', () => {
    expect(looksLikeAutosaveTick(requestFixture({ query: {} }), draft)).toBe(false)
  })

  it('survives a request with no query object at all', () => {
    expect(looksLikeAutosaveTick(requestFixture({ query: undefined }), draft)).toBe(false)
  })
})

describe('isCurrentlyPublished', () => {
  it('reads the published row', async () => {
    const payload = payloadFixture({ findByID: () => Promise.resolve(published) })

    await expect(isCurrentlyPublished(payload, 'pages', 1)).resolves.toBe(true)
  })

  it('is false for a doc whose published row says draft', async () => {
    const payload = payloadFixture({ findByID: () => Promise.resolve(draft) })

    await expect(isCurrentlyPublished(payload, 'pages', 1)).resolves.toBe(false)
  })

  // Undeterminable keeps generated rows hidden rather than exposing a subtree that is not live yet.
  it('is false when the read fails', async () => {
    const payload = payloadFixture({ findByID: () => Promise.reject(new Error('gone')) })

    await expect(isCurrentlyPublished(payload, 'pages', 1)).resolves.toBe(false)
  })

  it('is false when the read returns something unexpected', async () => {
    const payload = payloadFixture({ findByID: () => Promise.resolve(null) })

    await expect(isCurrentlyPublished(payload, 'pages', 1)).resolves.toBe(false)
  })
})

describe('isDraftSaveNotUnpublish', () => {
  const reqWith = (persisted: unknown, query: Record<string, unknown> = {}) =>
    requestFixture({
      query,
      payload: payloadFixture({ findByID: () => Promise.resolve(persisted) }),
    })

  it('is false when the doc is being published', async () => {
    await expect(isDraftSaveNotUnpublish('pages', published, reqWith(published))).resolves.toBe(
      false,
    )
  })

  // The cheap flag check short-circuits before the read, so an admin autosave costs no query.
  it('answers from the flags without reading, when they are there', async () => {
    let reads = 0

    const req = requestFixture({
      query: { autosave: 'true' },
      payload: payloadFixture({
        findByID: () => {
          reads++
          return Promise.resolve(published)
        },
      }),
    })

    await expect(isDraftSaveNotUnpublish('pages', draft, req)).resolves.toBe(true)
    expect(reads).toBe(0)
  })

  // The exact answer: a draft save leaves the PUBLISHED row intact, so finding it still published
  // means this was a draft save. A real unpublish would have flipped it.
  it('reads the persisted row on a flagless draft save', async () => {
    await expect(isDraftSaveNotUnpublish('pages', draft, reqWith(published))).resolves.toBe(true)
  })

  it('is false when the persisted row is no longer published, which is a real unpublish', async () => {
    await expect(isDraftSaveNotUnpublish('pages', draft, reqWith(draft))).resolves.toBe(false)
  })

  it('is false when the row cannot be read at all', async () => {
    const req = requestFixture({
      query: {},
      payload: payloadFixture({ findByID: () => Promise.reject(new Error('gone')) }),
    })

    await expect(isDraftSaveNotUnpublish('pages', draft, req)).resolves.toBe(false)
  })

  // Threading `req` keeps the read on the operation's own transaction; a req-less nested call would
  // open a second one and deadlock against it.
  it('threads the request into the read', async () => {
    let sawRequest = false

    const req = requestFixture({
      query: {},
      payload: payloadFixture({
        findByID: (args: unknown) => {
          sawRequest = Boolean(args && typeof args === 'object' && 'req' in args && args.req)
          return Promise.resolve(published)
        },
      }),
    })

    await isDraftSaveNotUnpublish('pages', draft, req)

    expect(sawRequest).toBe(true)
  })
})
