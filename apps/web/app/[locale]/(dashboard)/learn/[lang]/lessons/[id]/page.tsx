import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { SECTION_COLORS } from '@/lib/lesson-navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { playable, START_FIELDS } from '@/components/lesson/kinds';
import { Link } from '@/i18n/navigation';
import { lessonPaths, lessonStage, lessonTitle, loadLesson } from '@/lib/lesson';
import { cursorOf } from '@/lib/lesson-cursor';
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

/** The lesson start follows the same section colours and point numbers as the player. */
export default async function LessonPage({ params }: { params: Params }) {
  const { lang, id } = await params;
  const { lang: course, card, read } = await loadLesson(lang, id);
  const t = await getTranslations('Lesson');
  const kinds = await getTranslations('LessonKinds');
  const languages = await getTranslations('Languages');
  const status = await getTranslations('LessonStatus');
  const locale = await getLocale();
  const { outline } = read;
  const paths = lessonPaths(course, card.id);
  const examPages = outline.pages.filter((page) => page.role === 'exam');

  return (
    <div className="lesson-view">
      <FreshOnReturn lang={course} id={card.id} cursor={cursorOf(read.attempt)} />
      <div className="lesson-start">
        <Link href={`/learn/${course}`} className="lesson-back-link">
          {t('backToCourse')}
        </Link>
        <article className="lesson-start-card">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-base text-slate-400">
              <p>
                {languages(course)} / {card.level}
              </p>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-sm">
                {kinds(card.kind)}
              </span>
            </div>
            <h1 lang={course} className="text-3xl font-semibold hyphens-auto">
              {card.title}
            </h1>
            <p className="text-lg text-slate-200">{pick(outline.objective, locale)}</p>
            <p className="mt-4 text-slate-400">{t('aboutMinutes', { minutes: outline.minutes })}</p>
            <p className="text-sm text-slate-400">
              {status(card.status)}
              {card.score === null ? null : <> · {t('best', { score: card.score })}</>}
            </p>
          </header>

          {START_FIELDS.map((Field, n) => (
            <Field key={n} outline={outline} lang={course} />
          ))}

          <section className="lesson-start-outline">
            <h2 className="mb-3 text-lg font-semibold">{t('lessonOutline')}</h2>
            <ol className="flex flex-col gap-2">
              {outline.sections.map((section, n) => (
                <li
                  key={n}
                  className="lesson-outline-section"
                  style={
                    {
                      '--point-color':
                        section.points.length === 0
                          ? '#86efac'
                          : SECTION_COLORS[n % SECTION_COLORS.length],
                    } as CSSProperties
                  }
                >
                  <span className="lesson-section-letter" aria-hidden="true">
                    {String.fromCharCode(65 + n)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3>{pick(section.title, locale)}</h3>
                      <span className="lesson-time-chip">
                        <svg
                          aria-hidden="true"
                          width="15"
                          height="15"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        >
                          <circle cx="8" cy="9" r="5" />
                          <path d="M6 1h4M8 1v3M8 6v3l2 1M12 4l1-1" strokeLinecap="round" />
                        </svg>{' '}
                        {t('minutes', { minutes: section.minutes })}
                      </span>
                    </div>
                    {section.points.length > 0 ? (
                      <ol className="mt-2 flex flex-col gap-1">
                        {section.points.map((point) => (
                          <li key={point.number} className="flex items-start gap-2">
                            <span className="lesson-outline-number">{point.number}</span>
                            <span>{pick(point.title, locale)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">
                        {t('examOverview', {
                          pages: examPages.length,
                          questions: examPages.reduce((sum, page) => sum + page.questions, 0),
                        })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="lesson-start-actions">
            <LessonActions
              lang={course}
              id={card.id}
              stage={lessonStage(read.attempt)}
              playable={playable(outline.kind)}
              playPath={paths.play}
              resultsPath={paths.results}
            />
          </div>
        </article>
      </div>
    </div>
  );
}
