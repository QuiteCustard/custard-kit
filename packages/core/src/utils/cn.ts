import { clsx, type ClassValue } from 'clsx'
import {
  extendTailwindMerge,
  twMerge,
  type ConfigExtension,
  type DefaultClassGroupIds,
  type DefaultThemeGroupIds,
} from 'tailwind-merge'

/** Compose Tailwind class names: clsx for conditionals, tailwind-merge to resolve conflicts. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/**
 * `cn` for a project that declares its own `@theme` tokens. tailwind-merge only knows stock
 * Tailwind, so an unregistered custom font size or background image is classified as a colour and
 * dropped whenever it merges against a real one; a custom scale isn't deduped against itself at
 * all. Register those tokens here, and keep the registration in step with the `@theme` block that
 * declares them.
 */
export const createCn = <
  ClassGroupIds extends string = never,
  ThemeGroupIds extends string = never,
>(
  config: ConfigExtension<
    DefaultClassGroupIds | ClassGroupIds,
    DefaultThemeGroupIds | ThemeGroupIds
  >,
) => {
  const merge = extendTailwindMerge<ClassGroupIds, ThemeGroupIds>(config)
  return (...inputs: ClassValue[]) => merge(clsx(inputs))
}
