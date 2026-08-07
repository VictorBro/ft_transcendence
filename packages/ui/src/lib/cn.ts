export type ClassValue = string | false | null | undefined;

/**
 * Class name joiner. A mature design system reaches for clsx plus tailwind-merge;
 * this skeleton does not need conflict resolution yet, and staying dependency
 * free keeps @ft/ui trivially consumable from a server component.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
