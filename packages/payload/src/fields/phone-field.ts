import type { TextField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A text field rendered by a custom phone-input admin component. `component` is the path Payload
 * resolves for `admin.components.Field` - this package ships no UI, so the consumer's own
 * component is a required parameter, not a default.
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
