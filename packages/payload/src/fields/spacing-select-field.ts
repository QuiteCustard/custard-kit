import type { Option, SelectField } from 'payload'

// `Option` is either a bare string or a `{ label, value }` pair.
const optionValue = (option: Option): string =>
  typeof option === 'string' ? option : String(option.value)

/** Tailwind's default numeric spacing scale, 2xs (0.5rem) through 7xl (12rem), as select options. */
export const defaultSpacingOptions: Option[] = [
  { label: '2xs', value: '2' },
  { label: 'xs', value: '4' },
  { label: 'sm', value: '6' },
  { label: 'md', value: '8' },
  { label: 'lg', value: '10' },
  { label: 'xl', value: '12' },
  { label: '2xl', value: '16' },
  { label: '3xl', value: '20' },
  { label: '4xl', value: '24' },
  { label: '5xl', value: '32' },
  { label: '6xl', value: '40' },
  { label: '7xl', value: '48' },
]

/**
 * A labelled spacing select - the margin/padding-per-side pattern a block-options panel repeats
 * four times (top/bottom margin, top/bottom padding).
 *
 * ```ts
 * spacingSelectField({ name: 'mt', label: 'Margin Top' })
 * ```
 */
export const spacingSelectField = ({
  name,
  label,
  defaultValue = '4',
  options = defaultSpacingOptions,
}: {
  name: string
  label: string
  defaultValue?: string
  options?: Option[]
}): SelectField => ({
  name,
  label,
  type: 'select',
  // A default that isn't among `options` saves an invalid selection, so a custom scale falls back
  // to its own first entry rather than to this function's idea of a sensible spacing.
  defaultValue: options.some((option) => optionValue(option) === defaultValue)
    ? defaultValue
    : options[0] && optionValue(options[0]),
  options,
})
