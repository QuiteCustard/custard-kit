import type { TextField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * The import path of this package's own colour picker (`admin/colour-picker`), as Payload resolves
 * it for `admin.components.Field`. A site runs `payload generate:importmap` once after adding it.
 */
export const colourPickerComponent = '@quitecustard/payload/admin/colour-picker#ColourPicker'

/**
 * A text field rendered by a colour picker: this package's own unless `component` names another.
 * The field stays empty until a colour is picked, so an empty value can mean "use the default".
 *
 * ```ts
 * colourPickerField({ name: 'accent', label: 'Accent colour' })
 * colourPickerField({ name: 'accent' }, '@/components/colour-picker/ColourPicker')
 * ```
 */
export const colourPickerField = (
  overrides?: ComponentFieldOverrides<TextField>,
  component: string = colourPickerComponent,
): TextField =>
  componentField<TextField>('text', component, { name: 'colour', label: 'Colour' }, overrides)
