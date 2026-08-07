import type { LegalDocument } from '@/lib/legal';

export function LegalArticle({ doc }: { doc: LegalDocument }) {
  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="max-w-prose text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {doc.intro}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Last updated <time dateTime={doc.lastUpdated}>{doc.lastUpdated}</time>
        </p>
      </header>

      {doc.sections.map((section) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-8 flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p
              key={`${section.id}-p${index}`}
              className="max-w-prose leading-relaxed text-slate-700 dark:text-slate-300"
            >
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
