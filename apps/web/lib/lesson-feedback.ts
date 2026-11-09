/** Choose a presentation hint; the server remains the authority on the outcome. */
export function orthographyHint(given: string, expected: string) {
  const clean = (text: string) => text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const answer = clean(given);
  const target = clean(expected);
  if (answer !== target && answer.toLowerCase() === target.toLowerCase()) {
    return target === target.toLowerCase() ? 'almostLowercase' : 'almostCase';
  }
  return 'almostSpelling';
}
