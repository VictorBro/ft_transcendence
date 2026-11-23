import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/*
 * The tutor's answer, in the Markdown the model writes (#213): bold,
 * lists, headings, and with remark-gfm the tables and strikethrough a
 * model reaches for (a conjugation table, ~~allé~~). The text comes from an LLM, so no raw HTML: without
 * rehype-raw, react-markdown shows a tag as text, and its default
 * urlTransform drops javascript: links. Images are not shown either: one
 * would load from anywhere the model points to.
 *
 * Styled as RichText, the lesson's own teaching texts.
 */

const heading = 'font-semibold text-slate-100';

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-6">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="flex list-decimal flex-col gap-1 pl-6">
      {children}
    </ol>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-slate-400 line-through">{children}</del>,
  // A wide table scrolls on its own on a phone, not the whole page.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="border border-slate-700 bg-slate-800 px-3 py-1 font-semibold text-slate-100"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-slate-700 px-3 py-1">
      {children}
    </td>
  ),
  // A heading of an answer is a small title, not a page heading: the page has its own.
  h1: ({ children }) => <p className={`${heading} text-lg`}>{children}</p>,
  h2: ({ children }) => <p className={`${heading} text-lg`}>{children}</p>,
  h3: ({ children }) => <p className={heading}>{children}</p>,
  h4: ({ children }) => <p className={heading}>{children}</p>,
  h5: ({ children }) => <p className={heading}>{children}</p>,
  h6: ({ children }) => <p className={heading}>{children}</p>,
  code: ({ children }) => (
    <code className="rounded bg-slate-800 px-1 font-semibold text-indigo-200">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-slate-600 pl-3 text-slate-300">{children}</blockquote>
  ),
  // A footnote link stays on the page; any other opens a new tab.
  a: ({ children, href }) =>
    href?.startsWith('#') ? (
      <a href={href} className="underline">
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
        {children}
      </a>
    ),
  hr: () => <hr className="border-slate-700" />,
};

/**
 * cut: an answer stopped by an error. It trails off with a … at the end of
 * its last block, not on a line of its own, so it reads as cut short.
 */
export function TutorAnswer({ text, cut = false }: { text: string; cut?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 leading-relaxed ${
        cut ? "[&>:last-child]:after:content-['…']" : ''
      }`}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        disallowedElements={['img']}
        unwrapDisallowed
      >
        {text}
      </Markdown>
    </div>
  );
}
