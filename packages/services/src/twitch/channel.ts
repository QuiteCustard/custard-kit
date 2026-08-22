// Twitch logins are 4-25 characters of letters, digits and underscore; 3+ is accepted to stay in
// step with the looser pattern `@quitecustard/core/url/stream-target` uses.
const twitchLoginPattern = /^\w{3,25}$/

/**
 * Field validator returning `true` or an error message, for a channel-login input - the bare login,
 * not a URL.
 *
 * Free of server-only imports (no fetch, no `process.env`), so it can be bundled into a CMS admin
 * for client-side validation without dragging an API client along with it.
 */
export const validateTwitchChannel = (value: string | null | undefined): true | string => {
  if (!value) return 'Channel name required'
  if (!twitchLoginPattern.test(value.trim()))
    return 'Enter just the channel name (letters, numbers, underscore), not a URL.'

  return true
}
