import type { NumberField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A number field rendered by a custom height-input admin component. `component` is the path
 * Payload resolves for `admin.components.Field` - this package ships no UI, so the consumer's own
 * component is a required parameter, not a default.
 *
 * ```ts
 * heightField('@/components/height-input/HeightInput')
 * ```
 */
export const heightField = (
  component: string,
  overrides?: ComponentFieldOverrides<NumberField>,
): NumberField =>
  componentField<NumberField>(
    'number',
    component,
    { name: 'height', label: 'Height (%)' },
    overrides,
  )
