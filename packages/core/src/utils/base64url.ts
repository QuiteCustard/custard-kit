/** Bytes as base64url: `-` and `_` in place of `+` and `/`, no `=` padding. Safe in a URL as is. */
export const bytesToBase64url = (bytes: Uint8Array): string => {
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The bytes base64url text encodes, padded or not; null when the text is not base64url. */
export const base64urlToBytes = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null

  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)

  try {
    const binary = atob(padded)

    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}
