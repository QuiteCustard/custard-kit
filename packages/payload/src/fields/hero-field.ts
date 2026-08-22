import type { CollectionSlug, GroupField } from 'payload'

/**
 * The "hero" / banner group a profile-shaped collection carries: a media-type switch, an image, a
 * video and the video's poster, each conditional on the switch. One factory so the four fields and
 * their conditions agree across every collection that reuses it.
 *
 * ```ts
 * heroField({ imageCollection: 'images', videoCollection: 'videos' })
 * ```
 */
export const heroField = ({
  imageCollection,
  videoCollection,
  sizingNote,
}: {
  imageCollection: CollectionSlug
  videoCollection: CollectionSlug
  /** Shown under the surfaces that render the banner full-width. */
  sizingNote?: string
}): GroupField => ({
  name: 'hero',
  label: 'Banner',
  type: 'group',
  fields: [
    {
      name: 'type',
      label: 'Media Type',
      type: 'select',
      options: [
        { label: 'Image', value: 'image' },
        { label: 'Video', value: 'video' },
      ],
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: imageCollection,
      admin: {
        condition: (_, s) => s?.type === 'image',
        ...(sizingNote && { description: sizingNote }),
      },
    },
    {
      name: 'video',
      type: 'upload',
      relationTo: videoCollection,
      admin: { condition: (_, s) => s?.type === 'video' },
    },
    {
      name: 'poster',
      label: 'Video Poster Image',
      type: 'upload',
      relationTo: imageCollection,
      admin: {
        condition: (_, s) => s?.type === 'video',
        ...(sizingNote && { description: sizingNote }),
      },
    },
  ],
})
