import type { NumberField } from 'payload'
import { componentField, type ComponentFieldOverrides } from '../internal/component-field.js'

/**
 * A number field rendered by a custom height-input admin component. `component` is required: the
 * import path of your own component, as Payload resolves it for `admin.components.Field`.
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
