import { validateLinkUrl } from '@quitecustard/core/url/link-protocol'

/**
 * The link protocol allowlist as a text field's `validate`: root-relative paths, in-page anchors,
 * http(s), mailto: and tel:, never javascript:/data:. Empty values pass, so pair it with
 * `required` where the field must be filled.
 *
 * ```ts
 * { name: 'website', type: 'text', validate: validateLinkField }
 * ```
 *
 * Use this, not `validateLinkUrl` from `@quitecustard/core/url/link-protocol`, as the `validate`
 * itself. Payload calls `validate(value, options)`, and `validateLinkUrl`'s second parameter is a
 * protocol allowlist - the options object would land in that slot.
 */
export const validateLinkField = (value: string | null | undefined): true | string =>
  validateLinkUrl(value)
