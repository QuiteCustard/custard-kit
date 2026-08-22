import { sleep } from '@quitecustard/core/utils/sleep'
import { isRecord } from '@quitecustard/core/utils/is-record'

// Transient-error retry policy. start.gg intermittently answers with 429/5xx or a 200 carrying a
// non-complexity error and a null `data` payload (rate limiting, brief outages); retrying with
// exponential backoff clears these so a single hiccup doesn't abort a whole tournament sync.
const maxRetries = 4
const baseRetryDelayMs = 3000

// Global request pacing. start.gg's documented limit is 80 requests per 60s (a 750ms floor);
// 900ms leaves ~20% headroom. Every request funnels through this one gate, which also paces the
// page-1 bursts that per-loop sleeps never cover (each burst-triggered 429 costs up to ~45s of
// backoff). The gate is module-level state, so it paces one process: keep callers single-flight
// (see `@quitecustard/payload/db/sync-lock`) or each concurrent process paces only against itself.
const minIntervalMs = 900
let nextSlotAt = 0

const awaitRateSlot = async (): Promise<void> => {
  const wait = nextSlotAt - Date.now()
  nextSlotAt = Math.max(Date.now(), nextSlotAt) + minIntervalMs

  if (wait > 0) await sleep(wait)
}

/** Personal access token for the token-scoped client; falls back to `STARTGG_TOKEN`. */
export type StartggTokenAuth = { token?: string }

/**
 * Sends a raw GraphQL request to the start.gg API, paced by the global rate gate.
 */
export const fetchStartggGraphQL = async (
  query: string,
  variables: Record<string, string | number | boolean>,
  auth: StartggTokenAuth = {},
): Promise<Response> => {
  const token = auth.token ?? process.env.STARTGG_TOKEN

  // Without this the request goes out as `Bearer undefined` and start.gg answers 401, which reads
  // as a revoked token rather than a missing one.
  if (!token) throw new Error('No start.gg token: pass `token` or set STARTGG_TOKEN')

  await awaitRateSlot()
  return await fetch('https://api.start.gg/gql/alpha', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
}

/**
 * One page of results.
 *
 * `perPage` is the size the page was ACTUALLY fetched at, which is not always the size asked for: a
 * complexity error halves it and retries. A caller paginating by page number must carry this value
 * into its next request, or the page boundaries misalign and rows are skipped.
 */
export type StartggPage<T> = { data: T; complexity: number; perPage: number }

/** Token plus the page-size policy for one paged fetch. */
export type StartggPageOptions = StartggTokenAuth & {
  /**
   * When true (the default), a complexity error shrinks `perPage` and retries this same page in
   * place. A caller that paginates a whole resource itself passes `false` so it can reduce the page
   * size at the resource level instead - reducing it mid-pagination would misalign page boundaries
   * (page N at a smaller perPage covers different rows) and drop or duplicate results.
   */
  reducePerPage?: boolean
}

const attemptPage = async <T>(
  query: string,
  variables: Record<string, string | number | boolean>,
  perPage: number,
  parse: (data: unknown) => T | null,
  options: StartggPageOptions,
  attempt: number,
): Promise<StartggPage<T> | null> => {
  const { reducePerPage = true } = options
  // A missing token is configuration, not a transient failure - retrying it four times with
  // backoff would waste ~45s to reach the same answer.
  if (!(options.token ?? process.env.STARTGG_TOKEN)) {
    console.error('[startgg] no token: pass `token` or set STARTGG_TOKEN')
    return null
  }

  let res: Response

  try {
    res = await fetchStartggGraphQL(query, { ...variables, perPage }, options)
  } catch (e) {
    // The fetch itself can reject - a request timeout (AbortSignal.timeout) or a dropped connection -
    // which would otherwise throw straight past all the retry handling below and abort the whole sync.
    // These are transient, so back off and retry like any other recoverable failure.
    const detail = e instanceof Error ? e.message : String(e)

    if (attempt < maxRetries) {
      const delay = baseRetryDelayMs * 2 ** attempt
      console.warn(
        `[startgg] request failed (${detail}), retry ${attempt + 1}/${maxRetries} in ${delay}ms`,
      )
      await sleep(delay)
      return attemptPage(query, variables, perPage, parse, options, attempt + 1)
    }

    console.error(`[startgg] giving up after request failures: ${detail}`)
    return null
  }

  if (!res.ok) {
    // 429 (rate limit) and 5xx are transient - back off and retry before giving up.
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const delay = baseRetryDelayMs * 2 ** attempt
      console.warn(
        `[startgg] ${res.status} ${res.statusText}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`,
      )
      await sleep(delay)
      return attemptPage(query, variables, perPage, parse, options, attempt + 1)
    }

    console.error(`Start.gg API error: ${res.status} ${res.statusText}`)
    return null
  }

  const json: unknown = await res.json()
  const body: Record<string, unknown> = isRecord(json) ? json : {}
  const errors = Array.isArray(body.errors) ? body.errors : []

  const hasComplexityError = errors.some(
    (e) =>
      isRecord(e) &&
      typeof e.message === 'string' &&
      e.message.toLowerCase().includes('complexity'),
  )

  // A complexity error is deterministic - the same query at the same perPage always exceeds start.gg's
  // 1000-object cap - so retrying it in place at the same size is futile. The only fix is a smaller
  // page. When this call owns the page size (reducePerPage), halve and retry here; when the caller
  // paginates a whole resource itself (reducePerPage: false), surface null immediately so it can halve
  // at the resource level. Either way this must NOT fall through to the transient-retry block below: doing
  // so burns ~45s of pointless backoff (4 retries) per page-size level, which on a large resource
  // starves every later stage of the sync of time before the run is cut off.
  if (hasComplexityError) {
    if (!reducePerPage) {
      console.warn(
        `[startgg] complexity error at perPage=${perPage}; surfacing for resource-level reduction`,
      )
      return null
    }

    if (perPage <= 1) {
      console.error('[startgg] complexity error persists at perPage=1, giving up')
      return null
    }

    const reduced = Math.max(1, Math.floor(perPage / 2))
    console.warn(`[startgg] complexity error at perPage=${perPage}, retrying with ${reduced}`)
    return attemptPage(query, variables, reduced, parse, options, attempt)
  }

  // Any other GraphQL error (start.gg's generic "internal" errors) or a null `data` payload leaves
  // nothing usable for this page. These are usually transient, so back off and retry; only after
  // exhausting retries is the failure surfaced as null (callers must treat null as "abort", never as
  // "no data").
  if (errors.length > 0 || body.data == null) {
    const detail = JSON.stringify(errors.length > 0 ? errors : 'data was null').slice(0, 300)

    if (attempt < maxRetries) {
      const delay = baseRetryDelayMs * 2 ** attempt
      console.warn(
        `[startgg] unusable response, retry ${attempt + 1}/${maxRetries} in ${delay}ms: ${detail}`,
      )
      await sleep(delay)
      return attemptPage(query, variables, perPage, parse, options, attempt + 1)
    }

    console.error(`[startgg] giving up after unusable responses: ${detail}`)
    return null
  }

  const parsed = parse(body.data)

  if (parsed === null) {
    console.error('[startgg] response did not match the shape this query expects')
    return null
  }

  const { extensions } = body
  const complexity =
    isRecord(extensions) && typeof extensions.queryComplexity === 'number'
      ? extensions.queryComplexity
      : 0

  return { data: parsed, complexity, perPage }
}

/**
 * Fetches a single page from the start.gg API, returning it alongside the query's complexity.
 * Transient failures (timeouts, 429, 5xx) back off and retry; a complexity error shrinks `perPage`
 * and retries where `reducePerPage` allows it. Null once a failure is unrecoverable.
 *
 * ```ts
 * const page = await fetchStartggPage(
 *   query,
 *   { slug },
 *   50,
 *   (data) => (isRecord(data) && isRecord(data.event) ? { event: data.event } : null),
 *   { token },
 * )
 * ```
 *
 * `parse` turns the response's `data` payload into `T`, or null when it isn't the shape this query
 * asked for - the only thing that knows that shape is the caller. A null from `parse` is NOT
 * retried: the same query returns the same shape, so retrying only burns backoff.
 *
 * Check `perPage` on the result. A complexity error halves it, so the page you get back may be
 * smaller than the page you asked for, and a caller paginating by page number has to carry the
 * returned size forward or it will skip rows.
 */
export const fetchStartggPage = <T>(
  query: string,
  variables: Record<string, string | number | boolean>,
  perPage: number,
  parse: (data: unknown) => T | null,
  options: StartggPageOptions = {},
): Promise<StartggPage<T> | null> => attemptPage(query, variables, perPage, parse, options, 0)
