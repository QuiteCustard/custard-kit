/**
 * Matches a Discord webhook URL and nothing else, including the canary and ptb hosts.
 *
 * These URLs embed a credential token - never log one in full.
 */
export const discordWebhookRe =
  /^https:\/\/(discord\.com|canary\.discord\.com|ptb\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/

/**
 * Field validator returning `true` or an error message, for an editable webhook URL. Check at save
 * time AND skip a non-matching value at send time, so a webhook can never be pointed at an internal
 * service by whoever can edit the field. An empty value passes - use `required` for that.
 */
export const validateDiscordWebhookUrl = (value: string | undefined | null): true | string => {
  if (value && !discordWebhookRe.test(value)) {
    return 'Must be a Discord webhook URL (https://discord.com/api/webhooks/...)'
  }

  return true
}
