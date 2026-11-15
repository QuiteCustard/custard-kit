import { describe, expect, it } from 'vitest'
import { lexicalNodeText, lexicalPlainText } from './lexical-plain-text.js'

const text = (value: string) => ({ type: 'text', version: 1, text: value })
const block = (type: string, ...children: unknown[]) => ({ type, version: 1, children })
const paragraph = (...children: unknown[]) => block('paragraph', ...children)
const state = (...children: unknown[]) => ({ root: block('root', ...children) })

describe('lexicalPlainText', () => {
  it('writes each block on its own line', () => {
    expect(
      lexicalPlainText(state(block('heading', text('Title')), paragraph(text('Body copy.')))),
    ).toBe('Title\nBody copy.')
  })

  it('joins the inline runs of one block without a separator', () => {
    expect(
      lexicalPlainText(
        state(paragraph(text('Read '), block('link', text('the guide')), text(' first.'))),
      ),
    ).toBe('Read the guide first.')
  })

  it('keeps a line break inside a block', () => {
    expect(
      lexicalPlainText(
        state(paragraph(text('One'), { type: 'linebreak', version: 1 }, text('Two'))),
      ),
    ).toBe('One\nTwo')
  })

  it('leads each list item with a dash', () => {
    expect(
      lexicalPlainText(
        state(block('list', block('listitem', text('First')), block('listitem', text('Second')))),
      ),
    ).toBe('- First\n- Second')
  })

  it('writes a table row as its cells joined by a pipe', () => {
    const cell = (value: string) => block('tablecell', paragraph(text(value)))

    expect(
      lexicalPlainText(
        state(
          block(
            'table',
            block('tablerow', cell('Name'), cell('Value')),
            block('tablerow', cell('Limit'), cell('5')),
          ),
        ),
      ),
    ).toBe('Name | Value\nLimit | 5')
  })

  // An editor left empty still stores one blank paragraph; a caller testing for "no text" must
  // get an empty string back, not a newline.
  it('reads empty blocks as nothing', () => {
    expect(lexicalPlainText(state(paragraph()))).toBe('')
    expect(lexicalPlainText(state(paragraph(), paragraph(text('Kept')), paragraph()))).toBe('Kept')
  })

  it('skips nodes that hold no text, such as blocks and uploads', () => {
    expect(
      lexicalPlainText(
        state(paragraph(text('Before')), { type: 'block', version: 1, fields: { title: 'x' } }),
      ),
    ).toBe('Before')
  })

  it('reads a missing or malformed value as an empty string', () => {
    expect(lexicalPlainText(null)).toBe('')
    expect(lexicalPlainText(undefined)).toBe('')
    expect(lexicalPlainText('text')).toBe('')
    expect(lexicalPlainText({})).toBe('')
    expect(lexicalPlainText({ root: { type: 'root', children: 'nope' } })).toBe('')
  })
})

describe('lexicalNodeText', () => {
  it('reads a single node, for callers walking the tree themselves', () => {
    expect(lexicalNodeText(block('heading', text('Section '), text('one')))).toBe('Section one')
    expect(lexicalNodeText(text('leaf'))).toBe('leaf')
    expect(lexicalNodeText(7)).toBe('')
  })
})
