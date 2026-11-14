/**
 * Up to two uppercase initials from a name: `'ada lovelace'` → `'AL'`.
 *
 * `max` caps the count at one or two (two by default): `getInitials('ada lovelace', 1)` → `'A'`,
 * for an avatar too small to hold a pair.
 *
 * Total by design. Callers type the name as a string but the data disagrees - a row with a null
 * name arrives as undefined - and a throwing helper turns one bad row into a failed page, so a
 * missing name yields `''` rather than an error.
 */
export const getInitials = (name: string | null | undefined, max: 1 | 2 = 2): string =>
  (name ?? '')
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, max)
    .toUpperCase()
