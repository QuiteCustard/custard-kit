import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'
import { normaliseDisplay } from './normalise.js'

/**
 * Builds a profanity check over obscenity's english dataset, whose recommended transformers defeat
 * the usual bypasses (leetspeak `f4ck`, punctuation `sh!t`). Pure and client-safe - no server
 * imports - so one checker can back both an authoritative server-side validation and instant
 * client-side form feedback.
 *
 * ```ts
 * const isProfane = createProfanityChecker({ allowedTerms: ['analyst'], blockedTerms: ['xyzzy'] })
 * ```
 *
 * - `allowedTerms` exempts legitimate words the dataset misreads (names containing "fuk", the
 *   "anal" inside "analyst"). A term only exempts a blocked match falling entirely within it, so it
 *   never unblocks that profanity elsewhere.
 * - `blockedTerms` adds terms specific to one community on top of the dataset.
 *
 * Both lists take lowercase entries with no spaces, hyphens or underscores: they are matched
 * against input that has been Unicode-folded, lowercased and stripped of separators.
 */
export const createProfanityChecker = ({
  allowedTerms = [],
  blockedTerms = [],
}: {
  allowedTerms?: string[]
  blockedTerms?: string[]
} = {}): ((raw: string) => boolean) => {
  const dataset = allowedTerms.reduce(
    (set, term) => set.addPhrase((phrase) => phrase.addWhitelistedTerm(term)),
    new DataSet<{ originalWord: string }>().addAll(englishDataset),
  )

  const matcher = new RegExpMatcher({
    ...dataset.build(),
    ...englishRecommendedTransformers,
  })

  return (raw: string): boolean => {
    // The raw pass first: obscenity's transformers defeat punctuation and leetspeak bypasses
    // ("sh!t", "a$$") themselves, and the fold below strips exactly those characters - folding
    // first would turn "sh!t" into "sht" and hand the matcher a word it doesn't know.
    if (matcher.hasMatch(raw)) return true

    // Then folded, so styled Unicode (𝐟𝐮𝐜𝐤, fullwidth) can't smuggle a blocked word past.
    const folded = normaliseDisplay(raw)

    if (matcher.hasMatch(folded)) return true

    // Second pass with separators removed catches single-letter spacing bypasses ("f u c k").
    // Trade-off: stripping separators can abut two clean words into a blocked one (e.g. "Pen Island"
    // -> "penisland"). The obscenity whitelist covers in-word cases (Scunthorpe, assassin), but not
    // ones where the match eats a character from the preceding token: "Blue Analyst" -> "blueanalyst"
    // trips the mid-word "eanal" pattern, which no "analyst"-anchored whitelist term can cover because
    // it starts one char earlier. So scrub the allowed terms out of the stripped string before this
    // pass. A real slur abutting a clean word still matches - a space is left where the word was, so
    // e.g. "shitanalyst" -> "shit " stays blocked.
    const stripped = folded.toLowerCase().replace(/[\s_-]+/g, '')
    const scrubbed = allowedTerms.reduce((value, term) => value.replaceAll(term, ' '), stripped)

    if (matcher.hasMatch(scrubbed)) return true

    return blockedTerms.some((term) => scrubbed.includes(term))
  }
}
