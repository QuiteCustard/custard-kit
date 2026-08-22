import type { TextField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A text field rendered by a custom phone-input admin component. `component` is required: the
 * import path of your own component, as Payload resolves it for `admin.components.Field`.
 *
 * ```ts
 * phoneField('@/components/phone/Phone', { name: 'phone', required: true })
 * ```
 */
export const phoneField = (
  component: string,
  overrides?: ComponentFieldOverrides<TextField>,
): TextField =>
  componentField<TextField>('text', component, { name: 'phone', label: 'Phone' }, overrides)
