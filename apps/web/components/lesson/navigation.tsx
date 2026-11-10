'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { lessonPoints } from '@/lib/lesson-navigation';
import { pick } from '@/lib/localized';
import type { LessonOutline } from './types';

export function ExamFlag() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 14V2.5h8l-2 3 2 3H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LessonNavigation({ outline, index }: { outline: LessonOutline; index: number }) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const [tip, setTip] = useState<number | null>(null);
  const points = lessonPoints(outline);
  const examPages = outline.pages.flatMap((page, pageIndex) =>
    page.role === 'exam' ? [{ ...page, index: pageIndex }] : [],
  );
  const inExam = outline.pages[index]?.role === 'exam';
  const questions = examPages.reduce((sum, page) => sum + page.questions, 0);
  const firstExam = outline.pages.findIndex(
    (page) => !['presentation', 'practice'].includes(page.role),
  );
  const examRows = examPages.map((page, n) => ({
    key: n,
    number: `${n + 1}`,
    title: pick(page.step, locale),
    color: '#86efac',
    current: index === page.index,
    done: index > page.index,
    detail: t('examPageDetail', { questions: page.questions, seconds: page.limitS ?? 0 }),
    flag: false,
  }));
  // The lesson's points and the exam flag: the sidebar outside the exam,
  // and the phone strip all the way, as in the prototype.
  const lessonRows = [
    ...points.map((point) => ({
      key: point.number,
      number: `${point.number}`,
      title: pick(point.title, locale),
      color: point.color,
      current: point.pages.includes(index),
      done: point.pages.length > 0 && index > point.pages[point.pages.length - 1]!,
      detail: '',
      flag: false,
    })),
    {
      key: -1,
      number: '',
      title: t('finalExam'),
      color: '#86efac',
      current: firstExam >= 0 && index >= firstExam,
      done: false,
      detail: t('questionCount', { count: questions }),
      flag: true,
    },
  ];
  const rows = inExam ? examRows : lessonRows;
  const state = (row: (typeof rows)[number], examRow = inExam) =>
    row.current ? t('youAreHere') : row.done ? t(examRow ? 'answered' : 'done') : t('notYetOpen');

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setTip(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <div ref={root} className="lesson-navigation">
      <aside className="lesson-sidebar" aria-label={t('outline')}>
        <p className="lesson-nav-kicker">{inExam ? t('finalExam') : t('yourLesson')}</p>
        <p className="lesson-nav-title">
          {inExam
            ? t('examOverview', { pages: examPages.length, questions })
            : t('pointsDone', {
                done: rows.filter((row) => row.done).length,
                total: points.length,
              })}
        </p>
        <ol className="lesson-timeline">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`lesson-timeline-point ${row.current ? 'is-current' : ''} ${row.done ? 'is-done' : ''}`}
              style={{ '--point-color': row.color } as CSSProperties}
            >
              <span className="lesson-marker" aria-hidden="true">
                {row.flag ? <ExamFlag /> : inExam && row.done ? '✓' : row.number}
              </span>
              <div aria-current={row.current ? 'step' : undefined}>
                <span className="lesson-point-title">{row.title}</span>
                <span className="lesson-point-state">{row.detail || state(row)}</span>
                {inExam && row.current ? (
                  <span className="lesson-point-state">{t('youAreHere')}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {inExam ? <p className="lesson-nav-note">{t('examNavigationNote')}</p> : null}
      </aside>
      <div className="lesson-mobile-navigation">
        <ol
          aria-label={t('outline')}
          className="lesson-point-strip"
          style={
            {
              '--strip-count': lessonRows.length,
              '--strip-fill': `${lessonRows.length > 1 ? (lessonRows.filter((row) => row.done).length / (lessonRows.length - 1)) * 100 : 0}%`,
            } as CSSProperties
          }
        >
          {lessonRows.map((row) => (
            <li
              key={row.key}
              className={`${row.current ? 'is-current' : ''} ${row.done ? 'is-done' : ''}`}
              style={{ '--point-color': row.color } as CSSProperties}
            >
              <button
                type="button"
                className="lesson-marker"
                aria-label={`${row.number ? `${row.number}. ` : ''}${row.title}: ${state(row, false)}`}
                aria-current={row.current ? 'step' : undefined}
                aria-expanded={tip === row.key}
                aria-describedby={tip === row.key ? tipId : undefined}
                onClick={() => setTip(tip === row.key ? null : row.key)}
              >
                {row.flag ? <ExamFlag /> : row.number}
              </button>
            </li>
          ))}
        </ol>
        {tip !== null ? (
          <p id={tipId} role="tooltip" className="lesson-point-tooltip">
            {lessonRows.find((row) => row.key === tip)?.title} ·{' '}
            {state(
              lessonRows.find((row) => row.key === tip)!,
              false,
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
