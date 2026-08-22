import type { Field, SelectField } from 'payload'

// Factories, not shared constants: `buildConfig` sanitises fields IN PLACE - it assigns `validate`,
// `hooks`, `access` and `admin` onto the object it was handed, and deletes `localized` where the
// parent forbids it. One exported object reused across collections is therefore one object every
// collection mutates.

/** Left/center/right text alignment select, defaulting to left. */
export const alignmentField = (): SelectField => ({
  name: 'alignment',
  type: 'select',
  defaultValue: 'left',
  required: true,
  options: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ],
})

/** A plain "stretch to full width" toggle. */
export const fullWidthField = (): Field => ({
  name: 'fullWidth',
  type: 'checkbox',
})

/** A scroll-reveal animation toggle plus its style (fade/rise/zoom). */
export const animationField = (): Field => ({
  type: 'row',
  fields: [
    {
      name: 'animate',
      label: 'Animation?',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'animation',
      label: 'Animation Type',
      type: 'select',
      defaultValue: 'fade',
      options: [
        { label: 'Fade In', value: 'fade' },
        { label: 'Rise In', value: 'rise' },
        { label: 'Zoom In', value: 'zoom' },
      ],
      admin: {
        condition: (_, siblingData) => !!siblingData.animate,
      },
    },
  ],
})
