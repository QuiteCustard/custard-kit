import type { Payload, Where } from 'payload'

// One invocation's ceiling, so a pathological backlog cannot eat the whole function budget.
// Anything left over is reported as `jobsRemaining` for the next run to pick up.
const jobLimit = 25

/** The `concurrencyKey`s currently `processing`, so a dry run can exclude jobs `runJobs` would skip. */
const runningConcurrencyKeys = async (payload: Payload): Promise<Set<string>> => {
  const running = await payload.db.find<{ concurrencyKey?: string }>({
    collection: 'payload-jobs',
    limit: 0,
    pagination: false,
    select: { concurrencyKey: true },
    where: { and: [{ processing: { equals: true } }, { concurrencyKey: { exists: true } }] },
  })

  return new Set(running.docs.flatMap((doc) => (doc.concurrencyKey ? [doc.concurrencyKey] : [])))
}

/** What one drain did, for a cron route to return. */
export interface JobDrainReport {
  /** Jobs this run picked up and executed. */
  jobsRun: number
  /** Of those, the ones that ended in an error status rather than succeeding. */
  jobsFailed: number
  /** Runnable jobs left over once this run hit `jobLimit`. A dry run reports the whole runnable set. */
  jobsRemaining: number
  /** The reason the drain could not run at all, or null when it ran. */
  jobsSkipped: string | null
}

// Mirrors the clause `runJobs` builds internally (queues/operations/runJobs/index.js), so the dry-run
// count reports the set an applied run would actually pick up. A job that has exhausted its retries
// carries `hasError`, and one mid-flight carries `processing` - counting either would report a
// backlog that no run will ever clear. When concurrency control is on, `runJobs` also excludes jobs
// whose `concurrencyKey` matches one already processing - mirrored here via the same subquery, or a
// dry run would count a job that an applied run would skip.
const runnableJobsWhere = async (payload: Payload): Promise<Where> => {
  const and: Where[] = [
    { completedAt: { exists: false } },
    { hasError: { not_equals: true } },
    { processing: { equals: false } },
    {
      or: [
        { waitUntil: { exists: false } },
        { waitUntil: { less_than: new Date().toISOString() } },
      ],
    },
  ]

  if (payload.config.jobs?.enableConcurrencyControl) {
    const runningKeys = await runningConcurrencyKeys(payload)

    if (runningKeys.size > 0)
      and.push({
        or: [
          { concurrencyKey: { exists: false } },
          { concurrencyKey: { not_in: [...runningKeys] } },
        ],
      })
  }

  return { and }
}

/**
 * Runs whatever is waiting in the Payload job queue.
 *
 * 🔴 Nothing else does. `draftVersions()` sets `schedulePublish: true`, so Payload injects a
 * `schedulePublish` task and flips `jobs.enabled` - but there is no `autoRun`, no worker and no
 * second cron, so without this a scheduled publish is enqueued with its `waitUntil` and then sits
 * there forever while the admin UI goes on reporting it as scheduled.
 *
 * `allQueues` because the queue name is a per-job argument: anything queued onto a non-default queue
 * would otherwise be invisible here and strand exactly as it did before.
 *
 * Failures are returned, not thrown: cron monitoring keys on the response status, so one bad job
 * must not report an otherwise healthy run as failed. `[cron] job drain failed` is the log line to
 * alert on.
 */
export const runQueuedJobs = async (
  payload: Payload,
  { dryRun }: { dryRun: boolean },
): Promise<JobDrainReport> => {
  try {
    if (dryRun) {
      const { totalDocs } = await payload.count({
        collection: 'payload-jobs',
        where: await runnableJobsWhere(payload),
      })

      return { jobsRun: 0, jobsFailed: 0, jobsRemaining: totalDocs, jobsSkipped: null }
    }

    const result = await payload.jobs.run({ allQueues: true, limit: jobLimit })
    const statuses = Object.values(result.jobStatus ?? {})

    return {
      jobsRun: statuses.length,
      jobsFailed: statuses.filter((job) => job.status !== 'success').length,
      jobsRemaining: result.remainingJobsFromQueried,
      jobsSkipped: null,
    }
  } catch (error) {
    payload.logger.error({ err: error }, '[cron] job drain failed')

    return {
      jobsRun: 0,
      jobsFailed: 0,
      jobsRemaining: 0,
      jobsSkipped: error instanceof Error ? error.message : String(error),
    }
  }
}
