import type { CollectionConfig } from 'payload'

/**
 * A collection's `versions` config for the common draft-and-publish shape: autosave every second,
 * schedulable publish, keeping the last `maxPerDoc` versions per document.
 *
 * ```ts
 * versions: draftVersions(10)
 * ```
 */
export const draftVersions = (maxPerDoc = 10): CollectionConfig['versions'] => ({
  drafts: {
    autosave: {
      interval: 1000,
    },
    schedulePublish: true,
  },
  maxPerDoc,
})
