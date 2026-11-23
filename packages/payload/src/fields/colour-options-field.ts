import { deepMerge, type GroupField, type Option } from 'payload'
import { colourPickerComponent, colourPickerField } from './colour-picker-field.js'

/**
 * A colour choice that is either one of `presetOptions` or a free custom value, entered through
 * the colour picker (see `colourPickerField`). The shared shape a "background colour" and a
 * "border colour" picker both are - just with different presets.
 *
 * ```ts
 * colourOptionsField({ presetOptions })
 * ```
 */
export const colourOptionsField = ({
  component = colourPickerComponent,
  presetOptions,
  name = 'clr',
  label = 'Colour',
  overrides = {},
}: {
  /** Admin component path for the custom-colour text field; this package's own picker by default. */
  component?: string
  presetOptions: Option[]
  name?: string
  label?: string
  overrides?: Partial<GroupField>
}): GroupField => {
  const base: GroupField = {
    type: 'group',
    name,
    label,
    fields: [
      {
        name: 'hasCustom',
        label: 'Custom Colour',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        name: 'preset',
        label: 'Colour',
        type: 'select',
        options: presetOptions,
        admin: {
          condition: (_, siblingData) => !siblingData.hasCustom,
        },
      },
      colourPickerField(
        {
          name: 'custom',
          label: 'Custom Colour',
          required: true,
          admin: {
            condition: (_, siblingData) => !!siblingData.hasCustom,
          },
        },
        component,
      ),
    ],
  }

  return deepMerge(base, overrides)
}
