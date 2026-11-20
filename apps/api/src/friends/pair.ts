/** The same for (a, b) and (b, a): the key of a Friendship and of a Conversation. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
