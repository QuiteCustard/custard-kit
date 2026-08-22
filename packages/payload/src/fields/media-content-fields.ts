import {
  deepMerge,
  type CollectionSlug,
  type Field,
  type GroupField,
  type RichTextField,
} from 'payload'

const buildContentFields = (editor: RichTextField['editor']): Field[] => [
  {
    name: 'hasWysiwyg',
    type: 'checkbox',
    label: 'Include WYSIWYG?',
    defaultValue: false,
  },
  {
    name: 'overlay',
    label: 'Apply Gradient Overlay?',
    type: 'checkbox',
    defaultValue: true,
    admin: {
      condition: (_, { hasWysiwyg } = {}) => hasWysiwyg,
    },
  },
  {
    name: 'wysiwyg',
    type: 'richText',
    editor,
    label: false,
    admin: {
      condition: (_, { hasWysiwyg } = {}) => hasWysiwyg,
    },
  },
]

const buildMediaPickerFields = (
  imageCollection: CollectionSlug,
  videoCollection: CollectionSlug,
): Field[] => [
  {
    name: 'type',
    type: 'select',
    label: 'Media Type',
    defaultValue: 'image',
    required: true,
    options: [
      { label: 'Image', value: 'image' },
      { label: 'Video', value: 'video' },
      { label: 'Slideshow', value: 'slideshow' },
    ],
  },
  {
    name: 'image',
    type: 'upload',
    admin: { condition: (_, { type } = {}) => type === 'image' },
    relationTo: imageCollection,
    required: true,
  },
  {
    name: 'video',
    type: 'upload',
    admin: { condition: (_, { type } = {}) => type === 'video' },
    relationTo: videoCollection,
    required: true,
  },
  {
    name: 'poster',
    type: 'upload',
    relationTo: imageCollection,
    label: 'Video Poster Image',
    required: true,
    admin: { condition: (_, { type } = {}) => type === 'video' },
  },
  {
    name: 'images',
    label: 'Images',
    type: 'array',
    labels: { singular: 'Image', plural: 'Images' },
    required: true,
    minRows: 2,
    admin: { condition: (_, { type } = {}) => type === 'slideshow' },
    fields: [
      {
        name: 'img',
        type: 'upload',
        relationTo: imageCollection,
        label: false,
        required: true,
      },
    ],
  },
]

/**
 * The WYSIWYG-or-media-picker field set a content block reuses: an optional rich-text body plus,
 * unless `disableMedia`, an image/video/slideshow picker switch.
 *
 * ```ts
 * mediaContentFields({ editor, imageCollection: 'images', videoCollection: 'videos' })
 * ```
 */
export const mediaContentFields = ({
  editor,
  imageCollection,
  videoCollection,
  disableMedia = false,
}: {
  editor: RichTextField['editor']
  imageCollection: CollectionSlug
  videoCollection: CollectionSlug
  disableMedia?: boolean
}): Field[] => [
  ...buildContentFields(editor),
  ...(disableMedia ? [] : buildMediaPickerFields(imageCollection, videoCollection)),
]

/** `mediaContentFields`, wrapped in an unlabelled group - the shape most blocks actually embed. */
export const mediaContentGroupField = (options: {
  editor: RichTextField['editor']
  imageCollection: CollectionSlug
  videoCollection: CollectionSlug
  disableMedia?: boolean
  overrides?: Partial<GroupField>
}): GroupField => {
  const { overrides = {}, ...fieldOptions } = options

  const base: GroupField = {
    type: 'group',
    label: false,
    fields: mediaContentFields(fieldOptions),
  }

  return deepMerge(base, overrides)
}
