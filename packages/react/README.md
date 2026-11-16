# @quitecustard/react

React hooks for client components. One module per file — no barrels:

```ts
import { useActionRunner } from '@quitecustard/react/hooks/use-action-runner'
```

## Install

```
pnpm add @quitecustard/react
```

Every module is a subpath export, so TypeScript needs `moduleResolution` set to `bundler`,
`node16` or `nodenext` — the legacy `node` resolution can't see subpath exports at all.

Peer dependencies: `react` 19 or later. `next` is optional and needed only by the modules that say
so below.

## Contents

### `hooks/`

- `use-action-runner` — `useActionRunner()` runs a Next.js server action from a client component.
  It returns `{ run, isPending, error, setError }`: `run(action, onSuccess?)` clears the last error,
  runs the action in a transition, sets `error` when the action answers `{ error: string }`, and
  otherwise calls `onSuccess` with the result and then refreshes the route. Needs `next`.

```tsx
'use client'
import { useActionRunner } from '@quitecustard/react/hooks/use-action-runner'
import { renameThing } from './actions'

export const RenameForm = ({ id }: { id: number }) => {
  const { run, isPending, error } = useActionRunner()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        run(() => renameThing(id, new FormData(event.currentTarget)))
      }}
    >
      <label>
        Name
        <input name="name" disabled={isPending} />
      </label>
      <button type="submit" disabled={isPending}>
        Save
      </button>
      {error && <p>{error}</p>}
    </form>
  )
}
```

The action signals a refusal by returning an object with a string `error`; anything else counts as
success.
