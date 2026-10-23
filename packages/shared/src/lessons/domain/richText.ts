/**
 * Restricted Markdown for generated teaching prose (D46): vocabulary introductions and grammar
 * explanations. Blocks are separated by a blank line; a block whose lines all start with "- "
 * is a bulleted list, "1. " a numbered list, anything else a paragraph (single line breaks
 * become spaces). Inline markup: **bold** and `learning-language form`. Nothing else is
 * allowed: no headings, quotes, tables, code fences, links, images, HTML or nesting.
 * Parsing is pure, so the validator and the renderer share one definition.
 */
export type Inline = { kind: 'text' | 'strong' | 'learning'; text: string };
export type Block =
  { kind: 'paragraph'; inlines: Inline[] } | { kind: 'list'; ordered: boolean; items: Inline[][] };

const BULLET = /^- (.*)$/;
const NUMBERED = /^\d{1,2}\. (.*)$/;
const FORBIDDEN_LINE: [RegExp, string][] = [
  [/^#{1,6}\s/, 'headings'],
  [/^>/, 'block quotes'],
  [/^\|/, 'tables'],
  [/^```/, 'code fences'],
  [/^[*+] /, 'lists other than "- " and "1. "'],
];
const FORBIDDEN_INLINE: [RegExp, string][] = [
  [/<\/?[a-z][^>]*>/i, 'HTML'],
  [/!?\[[^\]]*\]\([^)]*\)/, 'links or images'],
  [/\\n/, 'a literal "\\n"'],
];

function parseInlines(text: string, where: string, errors: string[]): Inline[] {
  const out: Inline[] = [];
  const push = (kind: Inline['kind'], value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (kind === 'text' && last?.kind === 'text') last.text += value;
    else out.push({ kind, text: value });
  };
  let i = 0;
  while (i < text.length) {
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
    } else if (
      text[i] === '*' ||
      (text[i] === '_' && /(^|\s)_\S/.test(text.slice(Math.max(0, i - 1), i + 2)))
    ) {
      errors.push(`${where}: only **bold** and \`form\` markup is allowed (found "${text[i]}")`);
      push('text', text[i]);
      i++;
    } else {
      const next = text.slice(i).search(/\*|`/);
      const chunk = next < 0 ? text.slice(i) : text.slice(i, i + Math.max(next, 1));
      push('text', chunk);
      i += chunk.length;
    }
  }
  return out;
}

export function parseRichText(source: string): { blocks: Block[]; errors: string[] } {
  const errors: string[] = [];
  const blocks: Block[] = [];
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
    for (const line of lines) {
      for (const [re, what] of FORBIDDEN_LINE)
        if (re.test(line)) errors.push(`${where}: ${what} are not allowed`);
      for (const [re, what] of FORBIDDEN_INLINE)
        if (re.test(line)) errors.push(`${where}: ${what} not allowed`);
    }
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
      if (lines.some((l) => BULLET.test(l) || NUMBERED.test(l)))
        errors.push(`${where}: separate a list from surrounding text with a blank line`);
      blocks.push({ kind: 'paragraph', inlines: parseInlines(lines.join(' '), where, errors) });
    }
  });
  return { blocks, errors };
}

/** Structure signature used for locale parity: e.g. "p|ul:3|p". */
export function richTextShape(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === 'paragraph' ? 'p' : `${b.ordered ? 'ol' : 'ul'}:${b.items.length}`))
    .join('|');
}

/** Learning-language forms in reading order; they stay identical across interface locales. */
export function learningForms(blocks: Block[]): string[] {
  const inlines = blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.inlines] : b.items));
  return inlines
    .flat()
    .filter((i) => i.kind === 'learning')
    .map((i) => i.text);
}
