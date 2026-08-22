import type { TextField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A text field rendered by a custom colour-picker admin component. `component` is required: the
 * import path of your own component (e.g. `@/components/colour-picker/ColourPicker`), as Payload
 * resolves it for `admin.components.Field`.
 *
 * ```ts
 * colourField('@/components/colour-picker/ColourPicker', { name: 'colour', label: 'Colour' })
 * ```
 */
export const colourPickerField = (
  component: string,
  overrides?: ComponentFieldOverrides<TextField>,
): TextField =>
  componentField<TextField>('text', component, { name: 'colour', label: 'Colour' }, overrides)
