import type { CollectionAfterChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'
import { afterChangeArgs, requestFixture } from '../payload.fixture.js'
import { redirectOnSlugChange } from './redirect-on-slug-change.js'

type Call = { from: string; current: string; to: unknown; redirects: string }

/** Runs the hook with a payload that records the redirect it would write. */
const run = async (
  hook: CollectionAfterChangeHook,
  args: {
    operation?: 'create' | 'update'
    doc: { id: number; slug?: string | null }
    previousDoc?: { id: number; slug?: string | null }
    context?: Record<string, unknown>
  },
) => {
  const calls: Call[] = []
  const created: unknown[] = []
  const payload = {
    find: async ({ collection }: { collection: string }) => {
      calls.push({ from: '', current: '', to: null, redirects: collection })

      return { docs: [] }
    },
    create: async ({ data }: { data: unknown }) => {
      created.push(data)
    },
  }
  const result: unknown = await hook(
    afterChangeArgs({
      collection: 'teams',
      doc: args.doc,
      previousDoc: args.previousDoc ?? args.doc,
      operation: args.operation ?? 'update',
      req: requestFixture({ payload, context: args.context ?? {} }),
    }),
  )

  return { result, created, collections: new Set(calls.map(({ redirects }) => redirects)) }
}

const teamPath = (slug: string) => `/teams/${slug}`

describe('redirectOnSlugChange', () => {
  it('redirects the old address to the renamed document', async () => {
    const hook = redirectOnSlugChange({ path: teamPath })
    const { created, result } = await run(hook, {
      doc: { id: 7, slug: 'new' },
      previousDoc: { id: 7, slug: 'old' },
    })

    expect(created).toEqual([
      {
        from: '/teams/old',
        to: { type: 'reference', reference: { relationTo: 'teams', value: 7 } },
      },
    ])
    expect(result).toEqual({ id: 7, slug: 'new' })
  })

  it('does nothing on create, or when the slug is unchanged or missing', async () => {
    const hook = redirectOnSlugChange({ path: teamPath })
    const created = [
      ...(await run(hook, { operation: 'create', doc: { id: 1, slug: 'a' } })).created,
      ...(await run(hook, { doc: { id: 1, slug: 'a' }, previousDoc: { id: 1, slug: 'a' } }))
        .created,
      ...(await run(hook, { doc: { id: 1, slug: 'a' }, previousDoc: { id: 1, slug: null } }))
        .created,
      ...(await run(hook, { doc: { id: 1, slug: '' }, previousDoc: { id: 1, slug: 'a' } })).created,
    ]

    expect(created).toEqual([])
  })

  // A document with no page of its own would leave a redirect pointing at a 404.
  it('leaves out documents without a page', async () => {
    const hook = redirectOnSlugChange({ path: teamPath, hasPage: () => false })
    const { created } = await run(hook, {
      doc: { id: 7, slug: 'new' },
      previousDoc: { id: 7, slug: 'old' },
    })

    expect(created).toEqual([])
  })

  it('leaves out writes the caller skips', async () => {
    const hook = redirectOnSlugChange({
      path: teamPath,
      skip: (req) => req.context.bulk === true,
    })
    const { created } = await run(hook, {
      doc: { id: 7, slug: 'new' },
      previousDoc: { id: 7, slug: 'old' },
      context: { bulk: true },
    })

    expect(created).toEqual([])
  })

  it('writes to the redirects collection it is given', async () => {
    const hook = redirectOnSlugChange({ path: teamPath, redirects: 'site-redirects' })
    const { collections } = await run(hook, {
      doc: { id: 7, slug: 'new' },
      previousDoc: { id: 7, slug: 'old' },
    })

    expect(collections).toEqual(new Set(['site-redirects']))
  })
})
