const defaultAllowedProtocols = ['http:', 'https:', 'mailto:', 'tel:']

// A root-relative value is resolved against a placeholder origin and required to still point at it,
// rather than being pattern-matched. A `startsWith('//')` test is not enough: a browser reads
// `/\evil.test` as scheme-relative too, and resolves it to `https://evil.test/`.
const placeholderOrigin = 'https://root-relative.invalid'

const staysOnSameOrigin = (value: string): boolean => {
  try {
    return new URL(value, placeholderOrigin).origin === placeholderOrigin
  } catch {
    return false
  }
}

/**
 * Protocol allowlist for an author-editable URL that renders into an href: root-relative paths,
 * in-page anchors, and the given protocols (default http(s)/mailto:/tel: - never
 * javascript:/data:/vbscript: etc). Empty values pass; presence is each field's own concern.
 *
 * ```ts
 * validate: (value) => (!value ? 'URL required' : validateLinkUrl(value))
 * ```
 */
export const validateLinkUrl = (
  value: string | null | undefined,
  allowedProtocols: readonly string[] = defaultAllowedProtocols,
): true | string => {
  if (!value) return true

  if (value.startsWith('/') || value.startsWith('#'))
    return staysOnSameOrigin(value) ? true : 'Invalid URL'

  try {
    const parsed = new URL(value)

    if (!allowedProtocols.includes(parsed.protocol)) {
      return `Only ${allowedProtocols.join(', ')}, root-relative (/path), or anchor (#id) links allowed`
    }

    return true
  } catch {
    return 'Invalid URL'
  }
}

/**
 * Whether a raw string is an absolute http(s) URL - stricter than `validateLinkUrl`: no relative
 * paths or anchors. For render-side guards on values that came from outside a validated field.
 */
export const isHttpUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Import-side sanitiser for the same class of value: keep an http(s) URL as-is, collapse anything
 * else (javascript:, bare handles, garbage) to `''`.
 */
export const sanitiseHttpUrl = (value: string | null | undefined): string =>
  value && isHttpUrl(value) ? value : ''
