import Anthropic from '@anthropic-ai/sdk'
import type { ImageMediaType } from '@quitecustard/core/media/image-mime'
import { isRecord } from '@quitecustard/core/utils/is-record'

/**
 * Thrown when the image isn't the kind of thing that was asked for - a selfie, a meme, a menu
 * screen, the wrong document. Distinct from a scan that couldn't read what it found, so a caller
 * can reject an upload outright rather than accepting it with no data. The message is a short
 * description of what the image appears to be, safe to show whoever uploaded it.
 */
export class ImageRejectedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'ImageRejectedError'
  }
}

/**
 * A numeric value as a number, or null when it isn't one.
 *
 * Models return a number as a string often enough to matter (`"5,450"` for a large figure), so
 * separators are stripped before the check rather than treated as unreadable.
 */
export const numericCell = (value: unknown): number | null => {
  const num = typeof value === 'string' ? Number(value.replace(/,/g, '').trim() || 'NaN') : value

  return typeof num === 'number' && Number.isFinite(num) ? num : null
}

const buildPrompt = (subject: string, shape: string, notes?: string): string =>
  `First, decide whether this image is ${subject}.
It is NOT valid if it is a selfie or a photo of a person, a meme, a chat or messaging screenshot, a menu or loading screen, a different application, or anything else that is not ${subject}.

If it is NOT valid, return ONLY a JSON object in this exact format, no other text:
{
  "valid": false,
  "error": "<one short sentence describing what the image actually shows>"
}

If it IS valid, read it - even where some values are hard to make out.
Return ONLY a JSON object in this exact format, no other text:
{
  "valid": true,
  "data": ${shape}
}

Use the literal values above as type hints: a number where a number is shown, a string where a string is shown, true/false where a boolean is shown. Where a value is present in the layout but unreadable, use the empty form for its type (0, "", false) rather than omitting the key.${notes ? `\n${notes}` : ''}`

/**
 * Reads structured data out of an image with Claude vision, returning whatever shape the caller
 * asks for.
 *
 * Nothing about the subject or the result lives in this module: `subject` names what a valid image
 * is, `shape` is a JSON skeleton showing the model what to return, and `parse` turns the raw result
 * into `T`. A receipt, an ID card, a league table, a game scoreboard, a form - all the same call.
 *
 * ```ts
 * const receipt = await scanImage({
 *   apiKey,
 *   imageBytes,
 *   mediaType: 'image/png',
 *   subject: 'a printed shop receipt',
 *   shape: '{ "merchant": "text", "items": [{ "item": "text", "total": 0 }], "paid": 0 }',
 *   parse: (data) => (isRecord(data) && typeof data.merchant === 'string' ? toReceipt(data) : null),
 * })
 * ```
 *
 * Throws `ImageRejectedError` when the image isn't `subject` at all, and a plain Error when `parse`
 * returns null - so a caller decides whether a partial read is worth keeping, and gets an all-or-
 * nothing result either way.
 *
 * Needs an Anthropic API key and the optional `@anthropic-ai/sdk` peer dependency installed.
 */
export const scanImage = async <T>({
  apiKey,
  imageBytes,
  mediaType,
  subject,
  shape,
  parse,
  notes,
  model = 'claude-sonnet-4-6',
  maxTokens = 2048,
}: {
  apiKey: string
  imageBytes: Uint8Array
  mediaType: ImageMediaType
  /** What a valid image is, e.g. `'a printed shop receipt'`. */
  subject: string
  /**
   * A JSON skeleton of the result, with literal values standing in as type hints - e.g.
   * `'{ "name": "text", "score": 0, "winner": false }'`. Nest and repeat it however the data sits.
   */
  shape: string
  /** Validates the raw result into `T`, or null to fail the scan. */
  parse: (data: unknown) => T | null
  /** Extra prompt instructions for quirks of this layout. */
  notes?: string
  model?: string
  /** Headroom matters: a truncated reply parses as invalid JSON and loses the whole scan. */
  maxTokens?: number
}): Promise<T> => {
  const imageB64 = Buffer.from(imageBytes).toString('base64')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageB64 },
          },
          { type: 'text', text: buildPrompt(subject, shape, notes) },
        ],
      },
    ],
  })

  const firstBlock = message.content[0]

  if (!firstBlock || firstBlock.type !== 'text') throw new Error('Claude returned no text content')

  const raw = /\{[\s\S]*\}/.exec(firstBlock.text)?.[0]

  if (!raw) throw new Error(`Claude returned no JSON object: ${firstBlock.text.slice(0, 300)}`)

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 300)}`)
  }

  if (!isRecord(parsed))
    throw new Error(`Claude returned unexpected structure: ${raw.slice(0, 300)}`)

  // The envelope is model-generated, so every field is read with its own check. Declaring it as a
  // typed shape would claim `valid` is a boolean and `error` a string without either being tested,
  // and a non-string reason would reach whoever uploaded the image as "[object Object]".
  if (parsed.valid === false) {
    const reason =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : `This image does not appear to be ${subject}.`

    throw new ImageRejectedError(reason)
  }

  const result = parse(parsed.data)

  if (result === null)
    throw new Error(`Claude returned unusable data: ${JSON.stringify(parsed.data)?.slice(0, 300)}`)

  return result
}
