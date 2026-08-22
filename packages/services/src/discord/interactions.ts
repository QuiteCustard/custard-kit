import type {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIApplicationCommandInteractionDataOption,
  InteractionResponseType,
  InteractionType,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
} from 'discord-api-types/v10'
import { discordApiBase } from './api.js'

// Wire constants for the HTTP interactions flow.
//
// discord-api-types declares these as plain `enum`, not `const enum`, so importing them as VALUES
// cannot be inlined: TypeScript emits each as a self-assigning IIFE that bundlers cannot confidently
// treeshake, and the v10 barrel drags in every sibling enum - tens of KB in a serverless function
// that needs six integers. It would also promote the package out of devDependencies, where it sits
// as a types-only dependency.
//
// So the literals are written out and the `satisfies` clauses pin each to its enum MEMBER type,
// which is a type-only import and compiles to nothing. `ping: 3` fails to compile even though 3 is
// a valid InteractionType (MessageComponent), because the constraint is the exact member.
/** Incoming interaction types this flow handles, each pinned to its `InteractionType` member. */
export const interactionType = {
  /** Discord's liveness probe - fired on every Developer Portal endpoint save, and periodically after. */
  ping: 1,
  applicationCommand: 2,
  /**
   * Fired on every keystroke in an autocomplete option. Cannot be deferred: the only valid answer
   * is the choice list itself, within the 3s window.
   */
  autocomplete: 4,
} as const satisfies {
  ping: InteractionType.Ping
  applicationCommand: InteractionType.ApplicationCommand
  autocomplete: InteractionType.ApplicationCommandAutocomplete
}

/** Response types to answer with, each pinned to its `InteractionResponseType` member. */
export const interactionResponseType = {
  pong: 1,
  /** "Bot is thinking..." - buys 15 minutes to edit the reply in, instead of the 3s ack deadline. */
  deferredChannelMessage: 5,
  autocompleteResult: 8,
} as const satisfies {
  pong: InteractionResponseType.Pong
  deferredChannelMessage: InteractionResponseType.DeferredChannelMessageWithSource
  autocompleteResult: InteractionResponseType.ApplicationCommandAutocompleteResult
}

/** Discord's hard caps on an autocomplete response. Exceed any of them and the whole reply is rejected. */
export const autocompleteLimits = { choices: 25, nameLength: 100, valueLength: 100 } as const

/**
 * Subcommand and subcommand-group options nest further options instead of carrying a value, so the
 * union has to be narrowed before anything can read `.value`. A command that DOES use subcommands
 * reads its options one level down, from the subcommand entry rather than from here.
 */
const basicOptions = (
  options: APIApplicationCommandInteractionDataOption[] | undefined,
): APIApplicationCommandInteractionDataBasicOption[] =>
  (options ?? []).filter(
    (option): option is APIApplicationCommandInteractionDataBasicOption => 'value' in option,
  )

/**
 * Context-menu (user/message) command data has no `options` key at all - only chat-input data does,
 * so the key has to be tested for rather than read.
 */
const commandOptions = (interaction: APIApplicationCommandInteraction) =>
  basicOptions('options' in interaction.data ? interaction.data.options : undefined)

/** The Discord user who ran the command, whichever surface it came from: guilds send `member`, DMs `user`. */
export const interactionUserId = (interaction: APIApplicationCommandInteraction): string | null =>
  interaction.member?.user.id ?? interaction.user?.id ?? null

/** A string-valued command option (USER options arrive as the target's snowflake, which is a string). */
export const stringOption = (
  interaction: APIApplicationCommandInteraction,
  name: string,
): string | null => {
  const value = commandOptions(interaction).find((option) => option.name === name)?.value
  return typeof value === 'string' ? value : null
}

/**
 * The option currently being typed, on an autocomplete interaction. Its value is whatever the user
 * has entered so far - usually a fragment, and empty on the very first keystroke. Exactly one option
 * carries `focused: true`, and only string/number options can carry it at all.
 */
export const focusedOption = (
  interaction: APIApplicationCommandAutocompleteInteraction,
): { name: string; value: string } | null => {
  const option = basicOptions(interaction.data.options).find(
    (candidate) => 'focused' in candidate && candidate.focused,
  )

  if (!option) return null

  return { name: option.name, value: typeof option.value === 'string' ? option.value : '' }
}

/**
 * Replaces the deferred "thinking" placeholder with the real reply. The interaction token is itself
 * the credential for this route, so it carries no Authorization header - and it stays valid for 15
 * minutes, which is what makes the defer-then-edit shape safe across a cold start.
 * Never throws: a failed edit leaves the placeholder in the channel, which beats an unhandled
 * rejection in an `after()` callback.
 */
export const editInteractionReply = async (
  token: string,
  content: string,
  { appId = process.env.DISCORD_APP_ID }: { appId?: string } = {},
): Promise<void> => {
  if (!appId) {
    console.error('[discord] no app id: pass `appId` or set DISCORD_APP_ID')
    return
  }

  // `allowed_mentions.parse: []` - a reply can echo user-supplied text, and nothing the bot says
  // should ever be able to ping a role or @everyone.
  const body: RESTPatchAPIInteractionOriginalResponseJSONBody = {
    content,
    allowed_mentions: { parse: [] },
  }

  try {
    const response = await fetch(
      `${discordApiBase}/webhooks/${appId}/${token}/messages/@original`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok)
      console.error(`[discord] interaction edit failed: ${response.status} ${response.statusText}`)
  } catch (error) {
    console.error('[discord] interaction edit threw', error)
  }
}
