const inviteCodePath = /^\/[A-Za-z0-9-]+\/?$/
const invitePath = /^\/invite\/[A-Za-z0-9-]+\/?$/

/**
 * Whether a URL is a Discord server invite: `discord.gg/<code>` or
 * `discord.com/invite/<code>` (also `discordapp.com`), over http(s).
 *
 * ```ts
 * validate: (value) => (!value || isDiscordInviteUrl(value) ? true : 'Must be a Discord invite link')
 * ```
 *
 * For a field that renders as "join our Discord", where any other URL that clears a protocol check
 * - a channel link, a profile, another site entirely - is the wrong destination.
 */
export const isDiscordInviteUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

    if (host === 'discord.gg') return inviteCodePath.test(parsed.pathname)

    return (host === 'discord.com' || host === 'discordapp.com') && invitePath.test(parsed.pathname)
  } catch {
    return false
  }
}
