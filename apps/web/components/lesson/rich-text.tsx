import { lessons, type Language } from '@ft/shared';

/**
 * The simple Markdown of a teaching text (lessons.parseRichText):
 * paragraphs, lists, **bold**, and `forms` in the course language, which
 * get its lang attribute. Server or client, no state.
 */
export function RichText({ source, lang }: { source: string; lang: Language }) {
  const { blocks } = lessons.parseRichText(source);
  return (
    <div className="flex flex-col gap-3 leading-relaxed text-slate-200">
      {blocks.map((block, n) =>
        block.kind === 'paragraph' ? (
          <p key={n}>
            <Inlines inlines={block.inlines} lang={lang} />
          </p>
        ) : block.ordered ? (
          <ol key={n} className="flex list-decimal flex-col gap-1 pl-6">
            {block.items.map((item, m) => (
              <li key={m}>
                <Inlines inlines={item} lang={lang} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={n} className="flex list-disc flex-col gap-1 pl-6">
            {block.items.map((item, m) => (
              <li key={m}>
                <Inlines inlines={item} lang={lang} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Inlines({ inlines, lang }: { inlines: lessons.RichTextInline[]; lang: Language }) {
  return inlines.map((inline, n) =>
    inline.kind === 'strong' ? (
      <strong key={n} className="font-semibold text-slate-100">
        {inline.text}
      </strong>
    ) : inline.kind === 'learning' ? (
      <span key={n} lang={lang} className="font-semibold text-indigo-200">
        {inline.text}
      </span>
    ) : (
      <span key={n}>{inline.text}</span>
    ),
  );
}
