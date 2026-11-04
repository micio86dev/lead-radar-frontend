import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names the way shadcn components do: `clsx` for conditionals, `tailwind-merge` so a
 * caller-supplied utility replaces the variant's conflicting one instead of stacking both.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
