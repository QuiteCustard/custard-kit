import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractionResponseType, InteractionType } from 'discord-api-types/v10'
import type {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandInteraction,
} from 'discord-api-types/v10'
import {
  autocompleteLimits,
  editInteractionReply,
  focusedOption,
  interactionResponseType,
  interactionType,
  interactionUserId,
  stringOption,
} from './interactions.js'
import { captureConsole, stubFetch } from '@quitecustard/services/http.fixture.js'

// `member` and `user` sit on the interaction; `options` sits inside its command data.
const chatInput = ({
  options,
  ...top
}: Record<string, unknown>): APIApplicationCommandInteraction =>
  ({
    type: 2,
    ...top,
    data: { type: 1, name: 'link', ...(options ? { options } : {}) },
  }) as APIApplicationCommandInteraction

const autocomplete = (options: unknown[]): APIApplicationCommandAutocompleteInteraction =>
  ({
    type: 4,
    data: { type: 1, name: 'link', options },
  }) as APIApplicationCommandAutocompleteInteraction

beforeEach(() => {
  captureConsole()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The literals are written out rather than imported as values, because discord-api-types declares
// them as plain enums that cannot be inlined. These assert the numbers still match the enum.
describe('wire constants', () => {
  it('matches Discord’s interaction types', () => {
    expect(interactionType.ping).toBe(InteractionType.Ping)
    expect(interactionType.applicationCommand).toBe(InteractionType.ApplicationCommand)
    expect(interactionType.autocomplete).toBe(InteractionType.ApplicationCommandAutocomplete)
  })

  it('matches Discord’s response types', () => {
    expect(interactionResponseType.pong).toBe(InteractionResponseType.Pong)
    expect(interactionResponseType.deferredChannelMessage).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    )
    expect(interactionResponseType.autocompleteResult).toBe(
      InteractionResponseType.ApplicationCommandAutocompleteResult,
    )
  })

  // Exceed any of them and the whole reply is rejected, not truncated.
  it('states Discord’s autocomplete caps', () => {
    expect(autocompleteLimits).toEqual({ choices: 25, nameLength: 100, valueLength: 100 })
  })
})

describe('interactionUserId', () => {
  // Guilds send `member`, DMs send `user`.
  it('reads the user from whichever surface the command came from', () => {
    expect(interactionUserId(chatInput({ member: { user: { id: '1' } } }))).toBe('1')
    expect(interactionUserId(chatInput({ user: { id: '2' } }))).toBe('2')
  })

  it('prefers the guild member when both are present', () => {
    expect(interactionUserId(chatInput({ member: { user: { id: '1' } }, user: { id: '2' } }))).toBe(
      '1',
    )
  })

  it('is null when neither is present', () => {
    expect(interactionUserId(chatInput({}))).toBeNull()
  })
})

describe('stringOption', () => {
  it('reads a string option by name', () => {
    const interaction = chatInput({
      options: [
        { name: 'tag', type: 3, value: 'abc' },
        { name: 'other', type: 3, value: 'xyz' },
      ],
    })

    expect(stringOption(interaction, 'tag')).toBe('abc')
    expect(stringOption(interaction, 'other')).toBe('xyz')
  })

  // A USER option arrives as the target's snowflake, which is a string.
  it('reads a user option’s snowflake', () => {
    const interaction = chatInput({ options: [{ name: 'who', type: 6, value: '12345' }] })

    expect(stringOption(interaction, 'who')).toBe('12345')
  })

  it('is null for a missing option, or one whose value is not a string', () => {
    const interaction = chatInput({ options: [{ name: 'count', type: 4, value: 7 }] })

    expect(stringOption(interaction, 'count')).toBeNull()
    expect(stringOption(interaction, 'absent')).toBeNull()
    expect(stringOption(chatInput({}), 'tag')).toBeNull()
  })

  // Subcommand options NEST further options instead of carrying a value, so reading `.value` off
  // one without narrowing would return undefined - or a nested array.
  it('ignores a subcommand entry, which nests options rather than carrying a value', () => {
    const interaction = chatInput({
      options: [{ name: 'add', type: 1, options: [{ name: 'tag', type: 3, value: 'nested' }] }],
    })

    expect(stringOption(interaction, 'add')).toBeNull()
    expect(stringOption(interaction, 'tag')).toBeNull()
  })

  // Context-menu command data has no `options` key at all - only chat-input data does.
  it('survives context-menu data, which has no options key', () => {
    const contextMenu = { type: 2, data: { type: 2, name: 'Look up' } }

    expect(stringOption(contextMenu as APIApplicationCommandInteraction, 'tag')).toBeNull()
  })
})

describe('focusedOption', () => {
  it('finds the option currently being typed', () => {
    const interaction = autocomplete([
      { name: 'tag', type: 3, value: 'exa', focused: true },
      { name: 'other', type: 3, value: 'x' },
    ])

    expect(focusedOption(interaction)).toEqual({ name: 'tag', value: 'exa' })
  })

  // Empty on the very first keystroke, which must read as a fragment rather than as "no option".
  it('reads an empty fragment as an empty value, not a miss', () => {
    expect(
      focusedOption(autocomplete([{ name: 'tag', type: 3, value: '', focused: true }])),
    ).toEqual({ name: 'tag', value: '' })
  })

  it('reads a focused numeric option’s value as an empty string', () => {
    expect(focusedOption(autocomplete([{ name: 'n', type: 4, value: 7, focused: true }]))).toEqual({
      name: 'n',
      value: '',
    })
  })

  it('is null when nothing is focused', () => {
    expect(focusedOption(autocomplete([{ name: 'tag', type: 3, value: 'x' }]))).toBeNull()
    expect(focusedOption(autocomplete([]))).toBeNull()
    expect(
      focusedOption(autocomplete([{ name: 'tag', type: 3, value: 'x', focused: false }])),
    ).toBeNull()
  })
})

describe('editInteractionReply', () => {
  const appId = 'app-1'

  it('PATCHes the original response with the token as its credential', async () => {
    const { requests } = stubFetch([{ body: {} }])

    await editInteractionReply('token-abc', 'All done', { appId })

    expect(requests[0]?.url).toBe(
      'https://discord.com/api/v10/webhooks/app-1/token-abc/messages/@original',
    )
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.headers.authorization).toBeUndefined()
  })

  // A reply can echo user-supplied text, and nothing the bot says should be able to ping a role or
  // @everyone.
  it('suppresses every mention in the reply', async () => {
    const { requests } = stubFetch([{ body: {} }])

    await editInteractionReply('token-abc', '@everyone hello', { appId })

    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
      content: '@everyone hello',
      allowed_mentions: { parse: [] },
    })
  })

  // A failed edit leaves the placeholder in the channel, which beats an unhandled rejection in an
  // `after()` callback with nowhere to surface.
  it('never throws, whatever goes wrong', async () => {
    stubFetch([{ status: 404, statusText: 'Not Found' }])
    await expect(editInteractionReply('t', 'x', { appId })).resolves.toBeUndefined()

    stubFetch([{ throws: new Error('ECONNRESET') }])
    await expect(editInteractionReply('t', 'x', { appId })).resolves.toBeUndefined()
  })

  it('gives up without a request when no app id is available', async () => {
    const { calls } = stubFetch([{ body: {} }])
    const previous = process.env.DISCORD_APP_ID

    delete process.env.DISCORD_APP_ID

    await expect(editInteractionReply('t', 'x')).resolves.toBeUndefined()
    expect(calls()).toBe(0)

    if (previous !== undefined) process.env.DISCORD_APP_ID = previous
  })
})
