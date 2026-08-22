# custard-kit

pnpm workspace publishing `@quitecustard/core`, `@quitecustard/payload`, `@quitecustard/services`. See README.md
for package contents and consumption options.

## Commands

- `pnpm -r build` — `tsc -p tsconfig.build.json` per package, topological. Core builds first because
  the build config clears `paths`, so a dependent package resolves `@quitecustard/core/*` through
  node_modules to core's `dist` — exactly as a consumer would.
- `pnpm -r typecheck` — needs NO prior build: `tsconfig.json` maps the aliases to each package's
  `src`, so a clean checkout typechecks (tests and fixtures included) straight after `pnpm install`.
- `pnpm lint`, `pnpm format`
- `pnpm test` (vitest, `--watch` via `pnpm test:watch`, `pnpm test:coverage` for the enforced
  thresholds), `pnpm verify` — build + typecheck + lint + test, which is what `pnpm release` runs
  before publishing

## Tests

- Co-located as `src/**/*.test.ts`, **one test file per module**, named after the module it covers.
  The file path is the public API, so a test that lives somewhere else is a test nobody editing
  that module will find.
- Shared stubs go in `src/**/*.fixture.ts`. Both patterns are excluded from every package's build
  tsconfig, so neither reaches `dist` or the tarball, and neither is importable by a consumer.
- They run against **source**, not `dist`: `vitest.config.ts` aliases `@quitecustard/<pkg>/<path>` to
  that package's `src`, so `pnpm test` works on a clean checkout with no build step.
- **Tests are typechecked.** Each package has two configs: `tsconfig.json` covers everything under
  `src` (modules, tests, fixtures), emits nothing, and maps the workspace aliases to each package's
  `src`; `tsconfig.build.json` emits, and drops both the tests/fixtures and the `paths`. Vitest
  transpiles without checking, so without this a test could assert on a misspelled property forever.
  Two reasons the editor config is the one named `tsconfig.json`: VS Code resolves a file against
  the nearest one, so a test excluded from it falls into an inferred project with no `paths` and
  every aliased import goes red. And clearing `paths` for the build means a `src` module that
  imports through an alias fails to compile — tsc does not rewrite an alias on emit, so it would
  otherwise ship a specifier bare Node cannot resolve.
- No `as` casts, exactly as in `src`. Narrow with a type predicate instead — Payload's field and tab
  unions hide `name`/`label` behind their unnamed variants, so read those off a value widened to
  `unknown` and narrowed with `isRecord`. The one exception is a `.fixture.ts` reshaping a literal
  it authored a line earlier into a Payload argument type; nothing there narrows external data.
- Cover behaviour a regression would break silently — an open-redirect guard, an access check, a
  refusal that prevents a mass delete — rather than reaching for a coverage percentage. Where a
  test encodes a trap, say which trap in a comment above it.
- `pnpm test:coverage` enforces a floor set just under what the suite reaches. Treat a drop as a
  missing test, not a threshold to lower.
- Compose a stripped or invisible character from its code point (`String.fromCodePoint`) rather than
  pasting the literal: a literal control character is invisible in a diff, so a test can silently
  assert on the wrong one — or, once an editor normalises it away, on nothing at all.

## Conventions

- One module per file, exposed via wildcard `exports` — no barrels, no index files. A new file is
  automatically importable as `@quitecustard/<pkg>/<path>`.
- Modules live in folders, and the folder is part of the import path: `core` groups by kind
  (`format` `media` `url` `utils`), `services` by vendor (`discord` `steam` `startgg` `twitch`
  `ocr`), `payload` by concern (`access` `db` `documents` `errors` `fields` `operations`). Put a new
  module where its neighbours are and keep cross-folder imports rare — today the only ones point at
  `internal/`. For `services` the folder is load-bearing rather than tidy: flattened, `discord/api`
  would collide with `steam/api` and `discord/oauth` with `startgg/oauth`.
- **The file path IS the public API.** Adding a file adds an export; renaming or deleting one is a
  breaking change exactly like removing a symbol. Pre-1.0 that is a minor bump (`0.1.0` → `0.2.0`)
  and needs no ceremony. After 1.0 it is a major, and the kind thing is to leave the old path for
  one major as a module that re-exports the new one with `@deprecated` on it.
- A module that is genuinely an implementation detail goes in `src/internal/`, with
  `"./internal/*": null` listed BEFORE the wildcard in `exports` to make it unimportable. Don't
  create that folder speculatively — every module today is one a consumer could reasonably want.
- Relative imports carry explicit `.js` extensions so the emitted ESM runs on bare Node even though
  tsconfig uses `moduleResolution: Bundler` (NodeNext cannot resolve `next/server` types).
- Comments never cite real people's usernames or handles as examples — invent synthetic ones.
- Anything a consumer needs goes in JSDoc on the export (it emits into the `.d.ts`, so it is what
  hover shows) or in the package README (what npm renders). A `//` file header reaches maintainers
  of this repo only — it is stripped from the build. Audit the invariant by scanning
  `packages/*/dist/**/*.d.ts` for an `export` line whose previous non-blank line does not END WITH
  `*/` — testing for a line that IS `*/` misses every one-line JSDoc and reports a third of the
  surface as undocumented.
- The package README's Contents mirrors the folders, so the headings double as import paths. The
  root README summarises each folder in a line and links to the package one rather than repeating
  the module list — two copies of that list drift.
- Project-specific data (profanity word lists, theme tokens, collection and table names, blocked
  slugs) enters through parameters, never baked into a module. Nothing here names a particular
  site, deployment, or organisation — not in code, not in comments, not in examples.
- Nothing here may import `@payload-config` — that alias is per-project tsconfig config and does
  not resolve from inside node_modules. Helpers take a `payload` instance instead.
