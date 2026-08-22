import type { Field } from 'payload'

/**
 * Overrides for a field built by `componentField`: like `Omit<F, 'type'>`, but `name` and `label`
 * stay optional since the factory defaults both - matching the type to what the runtime already
 * accepts.
 */
export type ComponentFieldOverrides<F extends Field & { name: string; label?: unknown }> = Omit<
  F,
  'type' | 'name' | 'label'
> & {
  name?: F['name']
  label?: F['label']
}

/**
 * Shared body for the field factories that wire a single custom admin component onto an otherwise
 * bare field - `colourPickerField`, `phoneField`, `heightField`. Each keeps its own field type and
 * defaults.
 */
export const componentField = <F extends Field & { name: string; label?: unknown }>(
  type: F['type'],
  component: string,
  defaults: { name: string; label: string },
  overrides?: ComponentFieldOverrides<F>,
): F => {
  const { name = defaults.name, label = defaults.label, admin, ...rest } = overrides ?? {}

  return {
    type,
    name,
    label,
    admin: {
      ...admin,
      components: {
        ...admin?.components,
        Field: component,
      },
    },
    ...rest,
    // Spreading `overrides` over a field literal widens it past the branch of Payload's field
    // union it belongs to, so the cast reshapes a literal this function authored - it is not
    // narrowing unknown data.
  } as F
}
