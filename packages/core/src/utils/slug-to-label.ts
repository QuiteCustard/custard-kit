/** `'group-stage'` → `'Group Stage'`, for labelling a value whose slug is the only source. */
export const slugToLabel = (slug: string): string =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
