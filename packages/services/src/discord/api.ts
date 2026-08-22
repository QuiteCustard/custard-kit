// Not `discord.js`, and not by accident: that library is built around a stateful gateway client
// with a cache, which a serverless function cannot keep alive between invocations. Everything here
// is the HTTP-interactions shape instead - verify a signature, answer within 3 seconds, edit the
// reply later - so the whole surface is a handful of fetch calls against this base URL. Reach for
// discord.js if a project ever needs the gateway (presence, voice, live events); don't wrap it here.

/**
 * Base URL for direct Discord REST calls - bot token, OAuth, interaction responses. Webhook sends
 * don't use it: those post to a full URL that already embeds its own credential token.
 */
export const discordApiBase = 'https://discord.com/api/v10'
