/**
 * Reads a model's reply into the draft (#83). A reply is one JSON object,
 * in one of three shapes:
 *
 *   {"brief":{…},"content":{…}}   the whole lesson (content left out for vocabulary)
 *   {"edits":[…]}                 only the changes, see edits.ts
 *   {…}                           a bare brief, which some models send for vocabulary
 */
import { applyEdits, type Edit } from './edits';
import { isObject, type Json } from './json';

/**
 * The first JSON object in `text`, even inside a code fence or followed by
 * prose or a second object: it reads from the first "{" to the brace that
 * closes it, skipping the braces inside strings.
 *
 *   parseReply('```json\n{"a":1}\n``` {"a":1}')  →  { a: 1 }
 */
export function parseReply(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('no JSON object in the reply');
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      // A backslash skips the character after it, so \" does not end the string.
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('the JSON object is not closed: the reply was cut off');
}

/**
 * Applies a reply to `draft`, in place. Returns the edits that could not
 * apply, or the reason the reply could not be read at all.
 */
export function applyReply(
  draft: { brief: Json; content?: Json },
  text: string,
): { editProblems: string[] } | { error: string } {
  let reply: Json;
  try {
    reply = parseReply(text);
  } catch (e) {
    return { error: `your reply is not one JSON object: ${(e as Error).message}` };
  }
  if (!isObject(reply)) return { error: 'your reply is not one JSON object' };
  if (Array.isArray(reply.edits)) return { editProblems: applyEdits(draft, reply.edits as Edit[]) };

  if (isObject(reply.brief)) draft.brief = reply.brief;
  else if (!isObject(reply.content)) draft.brief = reply;
  if (isObject(reply.content)) draft.content = reply.content;
  return { editProblems: [] };
}
