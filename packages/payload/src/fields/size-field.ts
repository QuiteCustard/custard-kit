import type { SelectField } from 'payload'

/**
 * A fractional-column-width select: quarter/one-third/half/two-thirds/full, default one-third.
 *
 * A factory rather than a constant because `buildConfig` sanitises fields in place - see the note
 * in `layout-fields`.
 */
export const sizeField = (): SelectField => ({
  name: 'size',
  type: 'select',
  defaultValue: 'one-third',
  required: true,
  options: [
    { label: 'One Quarter', value: 'quarter' },
    { label: 'One Third', value: 'one-third' },
    { label: 'Half', value: 'half' },
    { label: 'Two Thirds', value: 'two-thirds' },
    { label: 'Full', value: 'full' },
  ],
})
