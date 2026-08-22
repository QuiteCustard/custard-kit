import type { FieldHook } from 'payload'

// A value is already absolute only if its scheme is followed by `//`. Testing for a bare colon
// would read the port in `x.test:8080/abc` as one and leave a legitimate host unprefixed.
const absoluteRe = /^[a-z][a-z0-9+.-]*:\/\//i
const httpRe = /^https?:\/\//i

const withScheme = (trimmed: string): string =>
  absoluteRe.test(trimmed) ? trimmed : `https://${trimmed}`

/**
 * Normalises a free-text URL field before it is stored: a bare host like `x.com/handle` becomes
 * `https://x.com/handle`, since Next's `<Link>` would otherwise treat it as a relative path.
 *
 * ```ts
 * { name: 'twitter', type: 'text', hooks: { beforeChange: [normaliseSocialUrl] } }
 * ```
 *
 * A value that already carries a scheme is left alone, whatever the scheme - pair the field with
 * `validateSocialUrl`, which is what refuses the ones that aren't http(s).
 */
export const normaliseSocialUrl: FieldHook = ({ value }) => {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()

  if (!trimmed) return trimmed

  return withScheme(trimmed)
}

/**
 * Validator for the same field: accepts what `normaliseSocialUrl` would turn into an http(s) URL.
 *
 * It trims first, exactly as the hook does. `validate` runs BEFORE `beforeChange`, so without this
 * a pasted value with a leading space is rejected as invalid even though the hook would have
 * stored it cleanly.
 */
export const validateSocialUrl = (value: string | undefined | null): true | string => {
  const trimmed = value?.trim()

  if (!trimmed) return true

  // Checked before prefixing, not after. `https://` + `ftp://x.test` parses as a perfectly good
  // https URL whose HOST is `ftp`, so a scheme-bearing value has to be judged on its own scheme.
  if (absoluteRe.test(trimmed) && !httpRe.test(trimmed)) return 'Must be an http(s) URL'

  try {
    const { protocol } = new URL(withScheme(trimmed))

    if (protocol !== 'http:' && protocol !== 'https:') return 'Must be an http(s) URL'

    return true
  } catch {
    return 'Must be a valid URL'
  }
}
