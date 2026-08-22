import {
  OverviewField,
  MetaTitleField,
  MetaDescriptionField,
  MetaImageField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import type { CollectionSlug, Tab } from 'payload'

/**
 * A ready-made "SEO" tab over `@payloadcms/plugin-seo`'s field factories - the title/description/
 * image/preview quartet every collection using the plugin wants, wired to a `meta` group.
 *
 * ```ts
 * tabs: [contentTab, seoTab({ imageCollection: 'images' })]
 * ```
 */
export const seoTab = ({
  imageCollection,
  localized = false,
}: {
  /** Upload collection the meta image field relates to. */
  imageCollection: CollectionSlug
  /**
   * Whether the three fields that store a value - title, image, description - are localized.
   * Defaults to false. Overview and Preview are UI-only and carry nothing to localize.
   */
  localized?: boolean
}): Tab => ({
  name: 'meta',
  label: 'SEO',
  fields: [
    OverviewField({
      titlePath: 'meta.title',
      descriptionPath: 'meta.description',
      imagePath: 'meta.image',
    }),
    MetaTitleField({
      hasGenerateFn: true,
      overrides: { localized },
    }),
    MetaImageField({
      relationTo: imageCollection,
      overrides: { localized },
    }),
    MetaDescriptionField({
      overrides: { localized },
    }),
    PreviewField({
      hasGenerateFn: true,
      titlePath: 'meta.title',
      descriptionPath: 'meta.description',
    }),
  ],
})
