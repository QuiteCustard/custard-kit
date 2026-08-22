import { deepMerge, type CollectionSlug, type Field, type GroupField, type Option } from 'payload'
import { validateLinkUrl } from '@quitecustard/core/url/link-protocol'
import { phoneField } from './phone-field.js'

/** A select option with a known string value - `Option` itself may be a bare string. */
type SelectOption = { label: string; value: string }

// The cast reshapes a literal this file authored, not unknown data: `Field` is a discriminated
// union, and spreading one member to override `admin` widens `admin` across every member, so the
// result no longer matches any single branch. A generic `<F extends Field>` fails the same way.
const withRowWidth = (field: Field): Field =>
  ({ ...field, admin: { ...field.admin, width: '50%' } }) as Field

/**
 * A polymorphic link field: internal reference, custom URL, and optionally a static route, a
 * dropdown-menu reference, and phone/email - each type only appears if its collection/component is
 * given, so an unwanted type is simply omitted rather than toggled off.
 *
 * ```ts
 * linkField({ relationTo: ['pages', 'posts'], styleOptions: [{ label: 'Primary', value: 'primary' }] })
 * ```
 */
export const linkField = ({
  relationTo,
  dropdown,
  staticOptions,
  phoneComponent,
  styleOptions,
  disableLabel = false,
  localizedLabel = false,
  overrides = {},
  maxDepth = 1,
}: {
  /** Collections the "internal link" type may point to. */
  relationTo: CollectionSlug[]
  /** Collection slug for a "dropdown" link type (e.g. a menus collection). Omit to disable it. */
  dropdown?: CollectionSlug
  /** Options for a "static link" type (named in-app routes). Omit to disable it. */
  staticOptions?: Option[]
  /** Admin component path for the "phone" type (see `phoneField`). Omit to disable phone/email. */
  phoneComponent?: string
  /** Style select options (e.g. primary/secondary/outline). Omit to skip the style field. */
  styleOptions?: SelectOption[]
  /** Whether the field also carries a "Label" text input alongside the link type. */
  disableLabel?: boolean
  /** Localise just the label, while the link structure itself stays shared across locales. */
  localizedLabel?: boolean
  overrides?: Partial<GroupField>
  maxDepth?: number
}): Field => {
  const typeOptions: Option[] = [
    { label: 'Internal link', value: 'reference' },
    { label: 'Custom URL', value: 'custom' },
  ]

  if (staticOptions) typeOptions.push({ label: 'Static link', value: 'static' })
  if (dropdown) typeOptions.push({ label: 'Dropdown', value: 'dropdown' })

  if (phoneComponent)
    typeOptions.push({ label: 'Phone', value: 'phone' }, { label: 'Email', value: 'email' })

  const noNewTabTypes = new Set([
    'email',
    ...(dropdown ? ['dropdown'] : []),
    ...(phoneComponent ? ['phone'] : []),
  ])

  const linkTypes: Field[] = [
    {
      name: 'reference',
      label: 'Document to link to',
      type: 'relationship',
      relationTo,
      required: true,
      maxDepth,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'reference',
      },
    },
    {
      name: 'url',
      label: 'Custom URL',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) =>
        !value ? 'URL required' : validateLinkUrl(value),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'custom',
      },
    },
  ]

  if (phoneComponent) {
    linkTypes.push(
      phoneField(phoneComponent, {
        name: 'phone',
        required: true,
        admin: {
          condition: (_, siblingData) => siblingData?.type === 'phone',
        },
      }),
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
        admin: {
          condition: (_, siblingData) => siblingData?.type === 'email',
        },
      },
    )
  }

  if (dropdown) {
    linkTypes.push({
      name: 'dropdown',
      label: 'Dropdown',
      type: 'relationship',
      relationTo: dropdown,
      required: true,
      // `id` is undefined on create, and `not_in: [undefined]` compiles to `id NOT IN (NULL)`,
      // which matches no row - the picker would come up empty on a new document.
      filterOptions: ({ id }: { id?: number | string }) =>
        id == null ? true : { id: { not_in: [id] } },
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'dropdown',
      },
    })
  }

  if (staticOptions) {
    linkTypes.push({
      name: 'static',
      label: 'Static Link',
      type: 'select',
      options: staticOptions,
      required: true,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'static',
      },
    })
  }

  const linkResult: GroupField = {
    name: 'link',
    type: 'group',
    admin: {
      hideGutter: true,
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            required: true,
            admin: {
              layout: 'horizontal',
              width: '50%',
            },
            defaultValue: 'reference',
            options: typeOptions,
          },
          {
            name: 'newTab',
            type: 'checkbox',
            admin: {
              style: {
                alignSelf: 'flex-end',
              },
              condition: (_, siblingData) => !noNewTabTypes.has(siblingData?.type),
              width: '50%',
            },
            label: 'Open in new tab',
          },
        ],
      },
    ],
  }

  if (!disableLabel) {
    linkResult.fields.push({
      type: 'row',
      fields: [
        ...linkTypes.map(withRowWidth),
        {
          name: 'label',
          type: 'text',
          localized: localizedLabel,
          admin: {
            width: '50%',
          },
          label: 'Label',
          required: true,
        },
      ],
    })
  } else {
    linkResult.fields.push(...linkTypes)
  }

  if (styleOptions) {
    linkResult.fields.push({
      name: 'style',
      type: 'select',
      admin: {
        description: 'Choose how the link should be rendered.',
      },
      defaultValue: styleOptions[0]?.value,
      options: styleOptions,
    })
  }

  return deepMerge(linkResult, overrides)
}
