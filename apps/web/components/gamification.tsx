import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  CHALLENGE_XP,
  LESSON_KINDS,
  type AchievementCode,
  type Challenge,
  type FinishResult,
  type Language,
  type Xp,
} from '@ft/shared';
import { ProgressBar } from '@ft/ui';

import { Link } from '@/i18n/navigation';
import { achievementParams, achievementsPath } from '@/lib/achievements';
import { xpBreakdown, type XpSource } from '@/lib/xp-breakdown';

/*
 * The gamification on the course page and the lesson results (#97). Server
 * components with no state: everything is in the HTML, so a page without
 * JavaScript shows it too.
 */

const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';

/** The label of each row of the XP card, by its source. */
const XP_LABEL = {
  lesson: 'xpLessonLabel',
  goal: 'xpGoalLabel',
  challenge: 'xpChallengeLabel',
} as const satisfies Record<XpSource, string>;
const TEXT_LINK =
  'inline-flex min-h-11 items-center self-start text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100';

/** An achievement's title, its numbers from the shared constants. */
export async function achievementTitle(code: AchievementCode): Promise<string> {
  const t = await getTranslations('Gamification');
  return t(`achievements.${code}.title`, achievementParams(code));
}

/** A check in a circle: done reads by its shape, not only its colour. */
export function DoneMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-300 ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * "Rank 3 · 397 of 600 XP". The bar runs from the rank's start to the next
 * one's, so it starts empty again at each rank. Always links to the rules.
 */
export async function RankLine({ xp, lang }: { xp: Xp; lang: Language }) {
  const t = await getTranslations('Gamification');

  return (
    <div data-slot="rank" className="flex flex-col gap-2">
      <p className="font-medium text-slate-200">
        {t('rank', { rank: xp.rank, total: xp.total, next: xp.nextRankAt })}
      </p>
      <ProgressBar
        value={xp.total - xp.rankStart}
        max={xp.nextRankAt - xp.rankStart}
        label={t('rankBar')}
      />
      <Link href={achievementsPath(lang)} prefetch={false} className={TEXT_LINK}>
        {t('rules')}
      </Link>
    </div>
  );
}

/**
 * The day's challenge. A kind challenge links to the lessons of that kind,
 * grouped by status: a passed lesson stays in the list, since redoing it
 * meets the challenge too.
 */
export async function ChallengeCard({ challenge, lang }: { challenge: Challenge; lang: Language }) {
  const t = await getTranslations('Gamification');
  const rule = t(`challenges.${challenge.code}.rule`);
  const isKind = (LESSON_KINDS as readonly string[]).includes(challenge.code);

  return (
    <section
      aria-labelledby="challenge-heading"
      data-done={challenge.done}
      className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6"
    >
      <h2 id="challenge-heading" className={HEADING}>
        {t('challengeHeading')}
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {challenge.done ? <DoneMark /> : null}
        {isKind ? (
          <Link
            href={`/learn/${lang}/lessons?kind=${challenge.code}&group=status`}
            prefetch={false}
            className="font-medium text-slate-100 underline underline-offset-4 hover:text-white"
          >
            {rule}
          </Link>
        ) : (
          <span className="font-medium text-slate-100">{rule}</span>
        )}
        <span className="text-sm font-semibold text-indigo-300">
          {t('challengeXp', { xp: CHALLENGE_XP })}
        </span>
        {challenge.done ? (
          <span className="text-sm font-semibold text-green-300">{t('challengeDone')}</span>
        ) : null}
      </div>
    </section>
  );
}

/** The achievements earned today, each linking to the achievements page. None, no section. */
export async function NewToday({ codes, lang }: { codes: AchievementCode[]; lang: Language }) {
  if (codes.length === 0) {
    return null;
  }
  const t = await getTranslations('Gamification');
  const titles = await Promise.all(codes.map((code) => achievementTitle(code)));

  return (
    <section aria-labelledby="new-today-heading" className="flex flex-col gap-3">
      <h2 id="new-today-heading" className={HEADING}>
        {t('newToday')}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {codes.map((code, n) => (
          <li key={code}>
            <Link
              href={achievementsPath(lang)}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-green-500/40 bg-green-500/5 px-4 text-sm font-medium text-green-200 hover:border-green-400"
            >
              <DoneMark className="size-5" />
              {titles[n]}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What a finish earned, as a card at the top of the lesson results: the
 * total, the lesson's share and the goal's and challenge's when they count,
 * each new achievement, then the rank the course is at now. `xp` is null when
 * the course's XP could not be read (no level yet): the card stands without
 * its rank. Inline, not a toast. `actions` closes the card: the way out of
 * the results (Retake, Back to course), so a long exam is not in the way.
 */
export async function FinishXp({
  finish,
  xp,
  lang,
  actions,
}: {
  finish: FinishResult;
  xp: Xp | null;
  lang: Language;
  actions?: ReactNode;
}) {
  const t = await getTranslations('Gamification');
  const titles = await Promise.all(finish.newAchievements.map((code) => achievementTitle(code)));
  // The amounts come from xpBreakdown (tested there); the card only names them.
  const { rows, legacyGoal } = xpBreakdown(finish);

  return (
    <section
      data-slot="xp"
      aria-labelledby="xp-heading"
      className="mb-4 flex flex-col gap-4 rounded-2xl border border-indigo-500/40 bg-indigo-500/5 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <h2 id="xp-heading" className="text-4xl font-bold tracking-tight text-indigo-300">
          {t('xpGained', { xp: finish.xpGained })}
        </h2>
        {/* A two-column list: the label, then its XP aligned on the right. */}
        <dl className="grid min-w-48 flex-1 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-slate-300 sm:max-w-72">
          {rows.map((row) => (
            <div key={row.source} className="contents">
              <dt>{t(XP_LABEL[row.source])}</dt>
              <dd className="text-right font-semibold text-slate-100 tabular-nums">
                {t('xpAmount', { xp: row.xp })}
              </dd>
            </div>
          ))}
        </dl>
        {/* A finish from before #95: its goal, without an amount never awarded. */}
        {legacyGoal ? <p className="text-slate-300">{t('xpGoalLabel')}</p> : null}
      </div>

      {titles.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-indigo-500/20 pt-4">
          <h3 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
            {t('newAchievements', { count: titles.length })}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {titles.map((title) => (
              <li
                key={title}
                className="inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 py-1 pr-3 pl-1 text-sm font-medium text-green-200"
              >
                <DoneMark className="size-5" />
                {title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {xp === null ? null : (
        <div className="border-t border-indigo-500/20 pt-4">
          <RankLine xp={xp} lang={lang} />
        </div>
      )}

      {actions ? (
        <div className="flex flex-wrap gap-3 border-t border-indigo-500/20 pt-4">{actions}</div>
      ) : null}
    </section>
  );
}
