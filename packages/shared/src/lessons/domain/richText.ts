/**
 * Reads the simple Markdown of the long teaching texts: a vocabulary
 * group's introduction and a grammar explanation.
 *
 * What is allowed:
 * - paragraphs, separated by a blank line (a single line break is a space);
 * - lists: every line starts with "- " (bullets) or "1. " (numbers);
 * - **bold**;
 * - `forms` in the language being learned, between backticks: `un livre`.
 * Nothing else: no headings, quotes, tables, links, images, HTML, and no
 * markup inside markup.
 *
 * parseRichText cuts a text into blocks (paragraphs and lists), and each
 * block into pieces (plain text, bold, form):
 *
 *   "Ces objets sont **masculins** :\n\n- `un livre`\n- `un stylo`"
 *     → paragraph [text "Ces objets sont ", strong "masculins", text " :"]
 *       list      [[learning "un livre"], [learning "un stylo"]]
 *
 * It returns the errors instead of throwing, so the validator can list
 * them all. The validator uses it to reject bad Markdown and to compare
 * the en, fr and de versions; the lesson player (Milestone 3) will use it
 * to display the text.
 */

/** A piece of a line: plain text, **bold**, or a `form` in the language being learned. */
export type Inline = { kind: 'text' | 'strong' | 'learning'; text: string };
/** A paragraph (a list of pieces), or a list (one list of pieces per line). */
export type Block =
  { kind: 'paragraph'; inlines: Inline[] } | { kind: 'list'; ordered: boolean; items: Inline[][] };

/** A bullet line, "- text"; the parentheses capture the text. */
const BULLET = /^- (.*)$/;
/** A numbered line, "1. text" to "99. text"; the parentheses capture the text. */
const NUMBERED = /^\d{1,2}\. (.*)$/;
/** Markdown that is recognised by how a line starts, with its name for the error message. */
const FORBIDDEN_LINE: [RegExp, string][] = [
  [/^#{1,6}\s/, 'headings'],
  [/^>/, 'block quotes'],
  [/^\|/, 'tables'],
  [/^```/, 'code fences'],
  [/^[*+] /, 'lists other than "- " and "1. "'],
];
/**
 * Markdown that can appear anywhere in a line: an HTML tag, a link
 * [text](url) or image ![text](url), and the two characters "\n" typed
 * as text instead of a real line break.
 */
const FORBIDDEN_INLINE: [RegExp, string][] = [
  [/<\/?[a-z][^>]*>/i, 'HTML'],
  [/!?\[[^\]]*\]\([^)]*\)/, 'links or images'],
  [/\\n/, 'a literal "\\n"'],
];

/**
 * Cuts one line (or one paragraph joined into a line) into pieces, reading
 * it from left to right. `where` names the place for error messages
 * ("block 2, item 1"); errors are added to `errors`. An unclosed ** or `
 * stops the reading: the rest of the line is dropped.
 */
function parseInlines(text: string, where: string, errors: string[]): Inline[] {
  const out: Inline[] = [];
  // Adds a piece; two plain texts in a row are merged into one.
  const push = (kind: Inline['kind'], value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (kind === 'text' && last?.kind === 'text') last.text += value;
    else out.push({ kind, text: value });
  };
  // i is the position being read.
  let i = 0;
  while (i < text.length) {
    // **bold**: find the closing **.
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      const inner = end < 0 ? '' : text.slice(i + 2, end);
      if (end < 0 || !inner.trim()) {
        errors.push(`${where}: unclosed or empty **bold**`);
        return out;
      }
      if (/[`*]/.test(inner)) errors.push(`${where}: bold text cannot contain other markup`);
      push('strong', inner);
      i = end + 2;
      // `form`: find the closing backtick.
    } else if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      const inner = end < 0 ? '' : text.slice(i + 1, end);
      if (end < 0 || !inner.trim()) {
        errors.push(`${where}: unclosed or empty \`learning-language form\``);
        return out;
      }
      if (inner.includes('*'))
        errors.push(`${where}: a learning-language form cannot contain other markup`);
      push('learning', inner);
      i = end + 1;
      // A single * or an _ at the start of a word: other Markdown (*italic*, _italic_), refused.
    } else if (
      text[i] === '*' ||
      (text[i] === '_' && /(^|\s)_\S/.test(text.slice(Math.max(0, i - 1), i + 2)))
    ) {
      errors.push(`${where}: only **bold** and \`form\` markup is allowed (found "${text[i]}")`);
      push('text', text[i]);
      i++;
      // Plain text: take everything up to the next * or backtick.
    } else {
      const next = text.slice(i).search(/\*|`/);
      const chunk = next < 0 ? text.slice(i) : text.slice(i, i + Math.max(next, 1));
      push('text', chunk);
      i += chunk.length;
    }
  }
  return out;
}

/**
 * Reads a whole text: returns its blocks and every error found. An
 * empty `errors` means the text is valid.
 */
export function parseRichText(source: string): { blocks: Block[]; errors: string[] } {
  const errors: string[] = [];
  const blocks: Block[] = [];
  // Windows line breaks become \n, then the text is cut at every blank line.
  const chunks = source
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[ \t]*\n+/);
  chunks.forEach((chunk, b) => {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const where = `block ${b + 1}`;
    // First, refuse the forbidden Markdown, line by line.
    for (const line of lines) {
      for (const [re, what] of FORBIDDEN_LINE)
        if (re.test(line)) errors.push(`${where}: ${what} are not allowed`);
      for (const [re, what] of FORBIDDEN_INLINE)
        if (re.test(line)) errors.push(`${where}: ${what} not allowed`);
    }
    // A block is a list only when every one of its lines is a list line.
    const bullets = lines.every((l) => BULLET.test(l));
    const numbered = lines.every((l) => NUMBERED.test(l));
    if (lines.length && (bullets || numbered)) {
      const re = bullets ? BULLET : NUMBERED;
      blocks.push({
        kind: 'list',
        ordered: !bullets,
        items: lines.map((l, n) => parseInlines(re.exec(l)![1], `${where}, item ${n + 1}`, errors)),
      });
    } else {
      // Otherwise a paragraph; a list line inside it means a blank line is missing.
      if (lines.some((l) => BULLET.test(l) || NUMBERED.test(l)))
        errors.push(`${where}: separate a list from surrounding text with a blank line`);
      blocks.push({ kind: 'paragraph', inlines: parseInlines(lines.join(' '), where, errors) });
    }
  });
  return { blocks, errors };
}

/**
 * The outline of a text, as a short string: "p|ul:3|p" is a paragraph,
 * a bullet list of 3 lines, a paragraph ("ol" for a numbered list). The
 * validator compares the outlines of the en, fr and de versions: they
 * must be the same.
 */
export function richTextShape(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === 'paragraph' ? 'p' : `${b.ordered ? 'ol' : 'ul'}:${b.items.length}`))
    .join('|');
}

/**
 * Every `form` of a text, in order: ["un livre", "un stylo"]. These are
 * in the language being learned, so they must be the same in the en, fr
 * and de versions; the validator compares them.
 */
export function learningForms(blocks: Block[]): string[] {
  const inlines = blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.inlines] : b.items));
  return inlines
    .flat()
    .filter((i) => i.kind === 'learning')
    .map((i) => i.text);
}
