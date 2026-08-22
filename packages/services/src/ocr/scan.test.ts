import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageRejectedError, numericCell, scanImage } from './scan.js'

const create = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

const reply = (text: string) => ({ content: [{ type: 'text', text }] })

const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const scan = <T>(over: Partial<Parameters<typeof scanImage<T>>[0]> = {}) =>
  scanImage<T>({
    apiKey: 'key-1',
    imageBytes,
    mediaType: 'image/png',
    subject: 'a printed shop receipt',
    shape: '{ "merchant": "text", "paid": 0 }',
    parse: (data) =>
      data && typeof data === 'object' && 'merchant' in data && typeof data.merchant === 'string'
        ? (data as T)
        : null,
    ...over,
  })

afterEach(() => {
  create.mockReset()
})

describe('numericCell', () => {
  it('takes a number as it stands', () => {
    expect(numericCell(5450)).toBe(5450)
    expect(numericCell(0)).toBe(0)
    expect(numericCell(-3)).toBe(-3)
    expect(numericCell(1.5)).toBe(1.5)
  })

  // Models return a number as a string often enough to matter, and "5,450" is the usual shape.
  it('coerces a number the model returned as a string', () => {
    expect(numericCell('5450')).toBe(5450)
    expect(numericCell('5,450')).toBe(5450)
    expect(numericCell('1,234,567')).toBe(1234567)
    expect(numericCell(' 12 ')).toBe(12)
  })

  it('refuses anything that is not a number', () => {
    expect(numericCell('none')).toBeNull()
    expect(numericCell('')).toBeNull()
    expect(numericCell('   ')).toBeNull()
    expect(numericCell(true)).toBeNull()
    expect(numericCell(null)).toBeNull()
    expect(numericCell(undefined)).toBeNull()
    expect(numericCell({})).toBeNull()
    expect(numericCell(Number.NaN)).toBeNull()
    expect(numericCell(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('ImageRejectedError', () => {
  // Distinct from a scan that couldn't read what it found, so a caller can reject an upload
  // outright rather than accepting it with no data.
  it('is an Error a caller can tell apart by name', () => {
    const err = new ImageRejectedError('This looks like a photo of a person.')

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ImageRejectedError)
    expect(err.name).toBe('ImageRejectedError')
    expect(err.message).toBe('This looks like a photo of a person.')
  })
})

describe('scanImage', () => {
  it('returns whatever the caller’s parse produced', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"Corner Shop","paid":12}}'))

    await expect(scan()).resolves.toEqual({ merchant: 'Corner Shop', paid: 12 })
  })

  it('sends the image and a prompt built from subject and shape', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"x"}}'))

    await scan()

    const [[request]] = create.mock.calls
    const [image, text] = request.messages[0].content

    expect(image).toMatchObject({ type: 'image', source: { media_type: 'image/png' } })
    expect(text.text).toContain('a printed shop receipt')
    expect(text.text).toContain('"merchant": "text"')
  })

  // Nothing about the subject or the result lives in the module - no row, column or table
  // vocabulary should survive into the prompt.
  it('puts no assumptions about the layout into the prompt', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"x"}}'))

    await scan()

    const [[request]] = create.mock.calls
    const prompt: string = request.messages[0].content[1].text

    for (const word of ['row', 'column', 'table', 'scoreboard', 'player']) {
      expect(prompt.toLowerCase()).not.toContain(word)
    }
  })

  it('appends caller notes when given', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"x"}}'))

    await scan({ notes: 'Totals are printed bottom-right.' })

    expect(create.mock.calls[0][0].messages[0].content[1].text).toContain(
      'Totals are printed bottom-right.',
    )
  })

  it('defaults the model and token budget, and takes overrides', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"x"}}'))

    await scan()
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-4-6', max_tokens: 2048 })

    create.mockClear()
    await scan({ model: 'claude-opus-5', maxTokens: 4096 })
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-opus-5', max_tokens: 4096 })
  })

  it('throws ImageRejectedError with the model’s reason when the image is not the subject', async () => {
    create.mockResolvedValue(reply('{"valid":false,"error":"This is a photo of a cat."}'))

    await expect(scan()).rejects.toThrow(ImageRejectedError)
    await expect(scan()).rejects.toThrow('This is a photo of a cat.')
  })

  // The reason is shown to whoever uploaded the image, so a non-string must not reach them as
  // "[object Object]" - the envelope is read field by field rather than assumed.
  it('falls back to a stated reason when the model’s is unusable', async () => {
    create.mockResolvedValue(reply('{"valid":false,"error":{"why":"nope"}}'))
    await expect(scan()).rejects.toThrow(/does not appear to be a printed shop receipt/)

    create.mockResolvedValue(reply('{"valid":false}'))
    await expect(scan()).rejects.toThrow(/does not appear to be a printed shop receipt/)

    create.mockResolvedValue(reply('{"valid":false,"error":""}'))
    await expect(scan()).rejects.toThrow(/does not appear to be a printed shop receipt/)
  })

  // Only a literal `false` rejects; a truthy-looking string must not be read as a rejection.
  it('does not read a non-boolean valid as a rejection', async () => {
    create.mockResolvedValue(reply('{"valid":"false","data":{"merchant":"x"}}'))

    await expect(scan()).resolves.toEqual({ merchant: 'x' })
  })

  it('throws a plain Error, not ImageRejectedError, when parse refuses the data', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"total":12}}'))

    await expect(scan()).rejects.toThrow(/unusable data/)
    await expect(scan()).rejects.not.toBeInstanceOf(ImageRejectedError)
  })

  it('pulls the JSON out of a reply wrapped in prose', async () => {
    create.mockResolvedValue(
      reply('Here you go:\n```json\n{"valid":true,"data":{"merchant":"x"}}\n```\nHope that helps.'),
    )

    await expect(scan()).resolves.toEqual({ merchant: 'x' })
  })

  it('throws when the reply carries no usable JSON object', async () => {
    create.mockResolvedValue(reply('I cannot read this image.'))
    await expect(scan()).rejects.toThrow(/no JSON object/)

    // Truncated before the closing brace, so there is no object to extract at all.
    create.mockResolvedValue(reply('{"valid": true, '))
    await expect(scan()).rejects.toThrow(/no JSON object/)

    // Braces present but the contents are not JSON - a trailing comma is the usual way.
    create.mockResolvedValue(reply('{"valid": true, "data": {"merchant": "x",},}'))
    await expect(scan()).rejects.toThrow(/invalid JSON/)

    create.mockResolvedValue(reply('[1,2,3]'))
    await expect(scan()).rejects.toThrow(/no JSON object/)
  })

  it('throws when the reply is not text at all', async () => {
    create.mockResolvedValue({ content: [{ type: 'tool_use' }] })
    await expect(scan()).rejects.toThrow(/no text content/)

    create.mockResolvedValue({ content: [] })
    await expect(scan()).rejects.toThrow(/no text content/)
  })

  it('passes the media type through for each supported image kind', async () => {
    create.mockResolvedValue(reply('{"valid":true,"data":{"merchant":"x"}}'))

    await scan({ mediaType: 'image/webp' })

    expect(create.mock.calls[0][0].messages[0].content[0].source.media_type).toBe('image/webp')
  })
})
