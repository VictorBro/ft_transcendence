import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { START_FIELDS } from '@/components/lesson/kinds';
import { Link } from '@/i18n/navigation';
import { lessonPaths, lessonStage, lessonTitle, loadLesson } from '@/lib/lesson';
import { pick } from '@/lib/localized';
import { FreshOnReturn, LessonActions } from './lesson-actions';

/** Reads the session, the card and the attempt on every request. */
export const dynamic = 'force-dynamic';

type Params = Promise<{ lang: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params;
  const title = await lessonTitle(lang, id);
  return title === null ? {} : { title };
}

const CHIP = 'rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300';
const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';

/**
 * The lesson page (#146): what the lesson is, how it goes, and the one
 * button to start, resume, or see the results. A server component with
 * no client state besides that button, so it renders without JavaScript.
 */
export default async function LessonPage({ params }: { params: Params }) {
  const { lang, id } = await params;
  const { lang: course, card, read } = await loadLesson(lang, id);
  const t = await getTranslations('Lesson');
  const kinds = await getTranslations('LessonKinds');
  const topics = await getTranslations('Topics');
  const themes = await getTranslations('Themes');
  const status = await getTranslations('LessonStatus');
  const locale = await getLocale();
  const { outline } = read;
  const paths = lessonPaths(course, card.id);

  return (
    <div className="relative -mx-3 -my-3 flex min-w-0 flex-col px-3 py-3 [scrollbar-width:none] lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <FreshOnReturn lang={course} id={card.id} />
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6 wrap-break-word">
        <Link
          href={`/learn/${course}`}
          className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
        >
          {t('backToCourse')}
        </Link>

        <header className="flex flex-col gap-3">
          <h1 lang={course} className="text-3xl font-semibold hyphens-auto">
            {card.title}
          </h1>
          <p lang={course} className="text-slate-300">
            {card.summary}
          </p>
          <ul className="flex flex-wrap gap-2">
            <li className={CHIP}>{card.level}</li>
            <li className={CHIP}>{kinds(card.kind)}</li>
            {card.topic ? <li className={CHIP}>{topics(card.topic)}</li> : null}
            {card.theme ? <li className={CHIP}>{themes(card.theme)}</li> : null}
            <li className={CHIP}>{t('position', { position: card.position })}</li>
            <li className={CHIP}>{status(card.status)}</li>
          </ul>
          {card.score === null ? null : (
            <p className="text-lg font-semibold text-slate-100">
              {t('best', { score: card.score })}
            </p>
          )}
        </header>

        <LessonActions
          lang={course}
          id={card.id}
          stage={lessonStage(read.attempt)}
          playPath={paths.play}
          resultsPath={paths.results}
        />

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className={HEADING}>{t('outline')}</h2>
            <span className="text-sm text-slate-400">
              {t('minutes', { minutes: outline.minutes })}
            </span>
          </div>
          <p className="text-slate-200">{pick(outline.objective, locale)}</p>
          <ol className="flex flex-col gap-4">
            {outline.sections.map((section, n) => (
              <li key={n} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium text-slate-100">{pick(section.title, locale)}</h3>
                  <span className="shrink-0 text-sm text-slate-500">
                    {t('minutes', { minutes: section.minutes })}
                  </span>
                </div>
                {section.points.length > 0 ? (
                  <ol className="flex flex-col gap-1 text-sm text-slate-400">
                    {section.points.map((point) => (
                      <li key={point.number} className="flex gap-2">
                        <span className="w-5 shrink-0 text-right tabular-nums text-slate-500">
                          {point.number}
                        </span>
                        <span>{pick(point.title, locale)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ol>
          {START_FIELDS.map((Field, n) => (
            <Field key={n} outline={outline} lang={course} />
          ))}
        </section>
      </article>
    </div>
  );
}
