# @quitecustard/core

Framework-free TypeScript helpers. No peer dependencies. One module per file — no barrels — so
imports name the exact module:

```ts
import { normaliseSlug } from '@quitecustard/core/format/normalise'
import { detectImageMimeType } from '@quitecustard/core/media/image-mime'
```

## Install

```
pnpm add @quitecustard/core
```

Every module is a subpath export, so TypeScript needs `moduleResolution` set to `bundler`,
`node16` or `nodenext` — the legacy `node` resolution can't see subpath exports at all.

## Contents

- `utils/` — sleep, is-record, one-of, numbers, safe-equal, form-data, slug-to-label, rgb-to-hex, cn
- `format/` — normalise (transliteration/slug/IGN pipeline), get-initials, ordinal, sanitise-text,
  profanity
- `format/date` — isValidDate, dateRangeReversed, and the `<input type="datetime-local">` ↔ ISO
  pair (dateInputToIso / isoToDateInput), plus formatDate over date-fns
- `format/amount` — `formatAmount(amount, symbol, intlLocale)`: locale-aware grouping with the
  caller's own currency symbol
- `media/` — image-mime, video-mime (magic-byte sniffing, including SVG)
- `url/stream-target` — Twitch/YouTube URL parsing
- `url/link-protocol` — validateLinkUrl / isHttpUrl / sanitiseHttpUrl: a protocol allowlist for an
  author-editable href, so `javascript:` and `data:` can't reach an anchor

## Notes

- `format/profanity` exports `createProfanityChecker({ allowedTerms, blockedTerms })` — word lists
  are constructor options, never baked into the module.
- `utils/cn` exports plain `cn` plus `createCn(config)` for a project whose `@theme` declares custom
  tokens tailwind-merge would otherwise misclassify.
- `format/date` takes a date-fns `Locale` object directly rather than a locale string, so the kit
  never has to know which locales a project ships.
- `media/image-mime` verifies that `<svg` is the document's **root** element — an HTML page with an
  inline `<svg>` is rejected, since browsers execute script in anything served as `image/svg+xml`.
  It is hand-rolled rather than delegating to `file-type` because that package detects binary
  formats only and explicitly excludes SVG, which is half of what an upload validator needs.
- There is no country list here on purpose. Use `i18n-iso-countries` in the consuming project, so
  labels can be localised — and sorted _after_ translation rather than fixed in English order.

MIT licensed. Source: [custard-kit](https://github.com/QuiteCustard/custard-kit).
