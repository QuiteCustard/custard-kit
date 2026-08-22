/**
 * A Steam account is identified by a 64-bit SteamID ("SteamID64"): a 17-digit decimal that, for
 * individual user accounts, always begins with 7656. Validate this shape wherever a SteamID64
 * arrives from an external source (the OpenID `claimed_id`, a stored value) before trusting it.
 *
 * Vanity/profile-URL parsing is intentionally omitted: the OpenID flow receives the SteamID64
 * directly, so it isn't needed unless a manual paste-a-link fallback is added later.
 */
export const isSteamID = (input: string): boolean =>
  /^\d{17}$/.test(input) && input.startsWith('7656')
