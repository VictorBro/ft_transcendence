/** A valid result fragment selects its part; missing or invalid fragments select the exam. */
export function resultPart(hash: string, count: number, fallback: number): number {
  const match = /^#part-([1-9]\d*)$/.exec(hash);
  if (match === null) return fallback;
  const index = Number(match[1]) - 1;
  return Number.isSafeInteger(index) && index >= 0 && index < count ? index : fallback;
}
