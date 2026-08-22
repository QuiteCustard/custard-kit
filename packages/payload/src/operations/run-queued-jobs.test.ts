import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { runQueuedJobs } from './run-queued-jobs.js'
import { payloadFixture } from '@quitecustard/payload/payload.fixture.js'

const logger = { error: () => {} }

const jobsPayload = ({
  totalDocs = 0,
  jobStatus,
  remaining = 0,
  runThrows,
  concurrencyControl = false,
  processingDocs = [] as { concurrencyKey?: string }[],
  onCount,
}: {
  totalDocs?: number
  jobStatus?: Record<string, { status: string }>
  remaining?: number
  runThrows?: Error
  concurrencyControl?: boolean
  processingDocs?: { concurrencyKey?: string }[]
  onCount?: (where: unknown) => void
} = {}) =>
  payloadFixture({
    logger,
    config: { jobs: { enableConcurrencyControl: concurrencyControl } },
    db: { find: () => Promise.resolve({ docs: processingDocs }) },
    count: ({ where }: { where: unknown }) => {
      onCount?.(where)
      return Promise.resolve({ totalDocs })
    },
    jobs: {
      run: () =>
        runThrows
          ? Promise.reject(runThrows)
          : Promise.resolve({ jobStatus, remainingJobsFromQueried: remaining }),
    },
  })

/** The clause keys the dry-run count filtered on, flattened out of its `and` array. */
const clauseKeys = (where: unknown): string[] => {
  if (!isRecord(where) || !Array.isArray(where.and)) return []

  return where.and.flatMap((clause) => (isRecord(clause) ? Object.keys(clause) : []))
}

describe('runQueuedJobs dry run', () => {
  it('counts without running anything', async () => {
    await expect(runQueuedJobs(jobsPayload({ totalDocs: 4 }), { dryRun: true })).resolves.toEqual({
      jobsRun: 0,
      jobsFailed: 0,
      jobsRemaining: 4,
      jobsSkipped: null,
    })
  })

  // A job that has exhausted its retries carries hasError, and one mid-flight carries processing.
  // Counting either reports a backlog no run will ever clear.
  it('excludes completed, errored and in-flight jobs from the backlog', async () => {
    let seen: unknown = null

    await runQueuedJobs(jobsPayload({ onCount: (where) => (seen = where) }), { dryRun: true })

    expect(clauseKeys(seen)).toEqual(
      expect.arrayContaining(['completedAt', 'hasError', 'processing', 'or']),
    )
  })

  it('leaves concurrency keys out of the clause when the feature is off', async () => {
    let seen: unknown = null

    await runQueuedJobs(
      jobsPayload({
        onCount: (where) => (seen = where),
        processingDocs: [{ concurrencyKey: 'sync' }],
      }),
      { dryRun: true },
    )

    expect(JSON.stringify(seen)).not.toContain('concurrencyKey')
  })

  // With concurrency control on, runJobs skips a job whose key is already processing - so counting
  // it would report a job an applied run would not pick up.
  it('excludes keys already processing when concurrency control is on', async () => {
    let seen: unknown = null

    await runQueuedJobs(
      jobsPayload({
        concurrencyControl: true,
        processingDocs: [{ concurrencyKey: 'sync' }, {}],
        onCount: (where) => (seen = where),
      }),
      { dryRun: true },
    )

    expect(JSON.stringify(seen)).toContain('concurrencyKey')
    expect(JSON.stringify(seen)).toContain('sync')
  })

  it('adds no concurrency clause when nothing is processing', async () => {
    let seen: unknown = null

    await runQueuedJobs(
      jobsPayload({ concurrencyControl: true, processingDocs: [], onCount: (w) => (seen = w) }),
      { dryRun: true },
    )

    expect(JSON.stringify(seen)).not.toContain('concurrencyKey')
  })
})

describe('runQueuedJobs applied', () => {
  it('reports what ran, what failed and what is left', async () => {
    const payload = jobsPayload({
      jobStatus: { a: { status: 'success' }, b: { status: 'error' }, c: { status: 'success' } },
      remaining: 12,
    })

    await expect(runQueuedJobs(payload, { dryRun: false })).resolves.toEqual({
      jobsRun: 3,
      jobsFailed: 1,
      jobsRemaining: 12,
      jobsSkipped: null,
    })
  })

  it('treats a missing job status map as nothing run', async () => {
    await expect(runQueuedJobs(jobsPayload({}), { dryRun: false })).resolves.toMatchObject({
      jobsRun: 0,
      jobsFailed: 0,
    })
  })

  // Cron monitoring keys on the response status, so one bad job must not report an otherwise
  // healthy run as failed.
  it('returns a failure rather than throwing it', async () => {
    const payload = jobsPayload({ runThrows: new Error('queue unavailable') })

    await expect(runQueuedJobs(payload, { dryRun: false })).resolves.toEqual({
      jobsRun: 0,
      jobsFailed: 0,
      jobsRemaining: 0,
      jobsSkipped: 'queue unavailable',
    })
  })

  it('reports a non-Error throw as a string', async () => {
    const payload = payloadFixture({
      logger,
      config: { jobs: {} },
      jobs: { run: () => Promise.reject('nope') },
    })

    await expect(runQueuedJobs(payload, { dryRun: false })).resolves.toMatchObject({
      jobsSkipped: 'nope',
    })
  })
})
