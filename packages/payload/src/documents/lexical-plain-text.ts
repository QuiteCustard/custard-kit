import { isRecord } from '@quitecustard/core/utils/is-record'

const childrenOf = (node: Record<string, unknown>): unknown[] =>
  Array.isArray(node.children) ? node.children : []

// Containers whose children are blocks of their own. Every other node (paragraph, heading, link,
// table cell) holds inline content and reads as one run.
const blockContainers = new Set(['root', 'list', 'table'])

const joinFilled = (parts: string[], separator: string) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(separator)

/**
 * The plain text of one serialised Lexical node and everything beneath it.
 *
 * Blocks come out one per line, a table row as its cells joined by `" | "`, a list item with a
 * leading `"- "`, and a line break as `"\n"`. Formatting, link targets and block or upload nodes
 * (which carry no `children`) contribute nothing. Reads the node structurally, so it takes whatever
 * a rich text field hands back and returns `''` for anything that is not a node.
 */
export const lexicalNodeText = (node: unknown): string => {
  if (!isRecord(node)) return ''
  if (node.type === 'linebreak') return '\n'
  if (typeof node.text === 'string') return node.text

  const parts = childrenOf(node).map(lexicalNodeText)

  if (node.type === 'tablerow') return joinFilled(parts, ' | ')
  if (node.type === 'listitem') return `- ${parts.join('').trim()}`
  if (typeof node.type === 'string' && blockContainers.has(node.type))
    return joinFilled(parts, '\n')

  return parts.join('')
}

/**
 * The plain text of a rich text field's value (the editor state, `{ root }`), for search indexes,
 * excerpts and anywhere else markup cannot go. An empty or missing value reads as `''`.
 *
 * ```ts
 * lexicalPlainText(post.content) // "First paragraph\n- a list item\nName | Value"
 * ```
 *
 * See `lexicalNodeText` for how each node type is written out.
 */
export const lexicalPlainText = (value: unknown): string =>
  isRecord(value) ? lexicalNodeText(value.root) : ''
