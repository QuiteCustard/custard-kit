import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const packageSrc = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url))

export default defineConfig({
  resolve: {
    // Tests run against SOURCE, not dist, so `pnpm test` works on a clean checkout with no build.
    // The alias mirrors each package's `exports` wildcard: `@quitecustard/core/utils/one-of` resolves to
    // `packages/core/src/utils/one-of.ts`, and the `.js` extensions the emitted ESM needs are
    // stripped so the same import specifier works either way.
    alias: [
      { find: /^@quitecustard\/core\/(.*)\.js$/, replacement: `${packageSrc('core')}/$1.ts` },
      { find: /^@quitecustard\/core\/(.*)$/, replacement: `${packageSrc('core')}/$1.ts` },
      { find: /^@quitecustard\/payload\/(.*)\.js$/, replacement: `${packageSrc('payload')}/$1.ts` },
      { find: /^@quitecustard\/payload\/(.*)$/, replacement: `${packageSrc('payload')}/$1.ts` },
      {
        find: /^@quitecustard\/services\/(.*)\.js$/,
        replacement: `${packageSrc('services')}/$1.ts`,
      },
      { find: /^@quitecustard\/services\/(.*)$/, replacement: `${packageSrc('services')}/$1.ts` },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Every shipped module, so one that nothing imports still reports as 0% rather than being
      // absent from the table - an untested module is the thing coverage is here to surface.
      include: ['packages/*/src/**/*.ts'],
      // Neither tests nor fixtures ship, so neither counts towards what the tarball covers.
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.fixture.ts'],
      reporter: ['text-summary', 'html'],
      // Set just under what the suite currently reaches, so a drop fails rather than drifting.
      thresholds: { statements: 97, branches: 95, functions: 95, lines: 97 },
    },
  },
})
