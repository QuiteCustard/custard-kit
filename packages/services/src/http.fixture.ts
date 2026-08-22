/**
 * Fetch stubs for the API clients. `.fixture.ts` is excluded from every package's build tsconfig,
 * so nothing here reaches `dist` or becomes a published subpath.
 */
import { vi } from 'vitest'

/** One canned response. `body` is JSON-encoded unless `text` is given instead. */
export type StubResponse = {
  status?: number
  statusText?: string
  body?: unknown
  text?: string
  headers?: Record<string, string>
  /** Reject instead of responding - a timeout or a dropped connection. */
  throws?: Error
}

export type RecordedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

const headerRecord = (init: RequestInit | undefined): Record<string, string> => {
  const headers = new Headers(init?.headers)
  const record: Record<string, string> = {}

  headers.forEach((value, key) => {
    record[key] = value
  })

  return record
}

const bodyText = (init: RequestInit | undefined): string | null => {
  const { body } = init ?? {}

  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()

  return null
}

/**
 * Installs a `fetch` that answers from `responses` in order and records every call. The last
 * response repeats once the list runs out, so a retry loop under test does not fall off the end.
 */
export const stubFetch = (responses: StubResponse[]) => {
  const requests: RecordedRequest[] = []
  let call = 0

  const fetchStub = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)

    requests.push({
      url,
      method: init?.method ?? 'GET',
      headers: headerRecord(init),
      body: bodyText(init),
    })

    const canned = responses[Math.min(call++, responses.length - 1)] ?? {}

    if (canned.throws) return Promise.reject(canned.throws)

    const status = canned.status ?? 200
    const payload = canned.text ?? JSON.stringify(canned.body ?? {})

    return Promise.resolve(
      new Response(status === 204 ? null : payload, {
        status,
        statusText: canned.statusText ?? '',
        headers: { 'content-type': 'application/json', ...canned.headers },
      }),
    )
  })

  vi.stubGlobal('fetch', fetchStub)

  return { requests, calls: () => call }
}

/** Silences a module's console output for one test, and hands back what it would have written. */
export const captureConsole = () => {
  const lines: unknown[][] = []
  const record = (...args: unknown[]) => lines.push(args)

  vi.spyOn(console, 'warn').mockImplementation(record)
  vi.spyOn(console, 'error').mockImplementation(record)

  return { lines }
}
