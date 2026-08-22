import { deepMerge, type GroupField, type Option } from 'payload'
import { colourPickerField } from './colour-picker-field.js'

/**
 * A colour choice that is either one of `presetOptions` or a free custom value, entered through
 * `component` (see `colourPickerField`). The shared shape a "background colour" and a "border
 * colour" picker both are - just with different presets.
 *
 * ```ts
 * colourOptionsField({ component: '@/components/colour-picker/ColourPicker', presetOptions })
 * ```
 */
export const colourOptionsField = ({
  component,
  presetOptions,
  name = 'clr',
  label = 'Colour',
  overrides = {},
}: {
  /** Admin component path for the custom-colour text field. */
  component: string
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
      colourPickerField(component, {
        name: 'custom',
        label: 'Custom Colour',
        required: true,
        admin: {
          condition: (_, siblingData) => !!siblingData.hasCustom,
        },
      }),
    ],
  }

  return deepMerge(base, overrides)
}
