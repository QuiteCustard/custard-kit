/**
 * Up to two uppercase initials from a name: `'ada lovelace'` → `'AL'`.
 *
 * Total by design. Callers type the name as a string but the data disagrees - a row with a null
 * name arrives as undefined - and a throwing helper turns one bad row into a failed page, so a
 * missing name yields `''` rather than an error.
 */
export const getInitials = (name: string | null | undefined): string =>
  (name ?? '')
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
