/**
 * The drawn fallback shown when someone has no uploaded avatar. Here rather than
 * in the component so it is covered by the lib suite, which needs no DOM.
 */

/** Stable per name, so the same person keeps the same colour. */
export function avatarHue(name: string): number {
  let value = 0;
  for (const character of name) {
    value = (value * 31 + (character.codePointAt(0) ?? 0)) % 360;
  }
  return value;
}

/**
 * Spread over code points, not sliced by index: display names allow any unicode
 * letter, and an emoji or CJK character is two code units.
 */
export function avatarInitial(name: string): string {
  return [...name][0]?.toUpperCase() ?? '?';
}
