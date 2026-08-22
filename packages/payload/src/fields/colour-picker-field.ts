import type { TextField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A text field rendered by a custom colour-picker admin component. `component` is the path Payload
 * resolves for `admin.components.Field` (e.g. `@/components/colour-picker/ColourPicker`) - this
 * package ships no UI, so the consumer's own component is a required parameter, not a default.
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
