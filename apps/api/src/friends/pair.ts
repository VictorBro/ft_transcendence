/** The same for (a, b) and (b, a): the Friendship key. #158's Conversation can use it too. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
