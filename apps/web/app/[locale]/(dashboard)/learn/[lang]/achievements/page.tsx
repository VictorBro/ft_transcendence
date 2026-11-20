import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  ACHIEVEMENTS,
  CHALLENGE_XP,
  CHALLENGES,
  GOAL_XP,
  LanguageSchema,
  LESSON_PASS_MARK,
  LESSON_XP,
  RANK_STEP,
  SERVER_EVENTS,
  type Achievement,
  type AchievementCode,
} from '@ft/shared';
import { ProgressBar } from '@ft/ui';

import { DoneMark } from '@/components/gamification';
import { RefreshOn } from '@/components/refresh-on';
import { Link } from '@/i18n/navigation';
import { achievementParams, loadAchievements, rankStartOf } from '@/lib/achievements';
import { findCourse, requireCourses } from '@/lib/courses';

/** Reads the session, the courses and the achievements on every request. */
export const dynamic = 'force-dynamic';

const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Gamification' });
  return { title: t('title') };
}

/**
 * All sixteen achievements of a course, in catalogue order, with the rules
 * written out (#97). One GET achievements call. The guard is the course
 * home's, since #52 guards only that page.
 */
export default async function AchievementsPage({ params }: { params: Promise<{ lang: string }> }) {
  // First, so an anonymous visitor gets /login and not a 404 or onboarding.
  const { courses } = await requireCourses();

  const { lang } = await params;
  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }
  const course = findCourse(courses, parsed.data);
  if (course === null || course.level === null) {
    redirect(`/onboarding?lang=${parsed.data}`);
  }

  const list = await loadAchievements(course.lang);
  if (list === 'signed-out') {
    redirect('/login');
  }

  const t = await getTranslations('Gamification');
  const lesson = await getTranslations('Lesson');
  const earned = list.items.filter((item) => item.day !== null).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      <RefreshOn events={[SERVER_EVENTS.COURSE_UPDATED]} />
      <div className="relative -mx-3 -my-3 flex min-w-0 flex-1 flex-col gap-6 px-3 py-3 lg:overflow-y-auto">
        <div className="flex flex-col gap-2">
          <Link
            href={`/learn/${course.lang}`}
            className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline underline-offset-4 hover:text-slate-100"
          >
            {lesson('backToCourse')}
          </Link>
          <h1 className="text-3xl font-semibold">{t('title')}</h1>
          <p className="text-slate-400">{t('summary', { earned, total: list.items.length })}</p>
          <ProgressBar
            value={earned}
            max={list.items.length}
            label={t('summaryBar')}
            className="max-w-sm"
          />
        </div>

        {GROUPS.map((group) => {
          const items = list.items.filter((item) => groupOf(item.code) === group);
          const done = items.filter((item) => item.day !== null).length;
          return (
            <section
              key={group}
              aria-labelledby={`group-${group}`}
              data-group={group}
              className="flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  id={`group-${group}`}
                  className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
                >
                  {t(`groups.${group}`)}
                </h2>
                <span className="text-sm text-slate-500">
                  {t('groupCount', { earned: done, total: items.length })}
                </span>
              </div>
              <ol className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <AchievementCard key={item.code} item={item} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      {/* A column on a wide screen, the rules scrolling in it like the list: they can outgrow a short window. */}
      <aside className="-my-3 w-full shrink-0 py-3 lg:flex lg:min-h-0 lg:w-95 lg:flex-col">
        <HowItWorks />
      </aside>
    </div>
  );
}

/**
 * The four families of ACHIEVEMENTS, in catalogue order: each is a run of
 * the catalogue, so grouping keeps the order the API sends.
 */
const GROUPS = ['lessons', 'streaks', 'challenges', 'levels'] as const;
type Group = (typeof GROUPS)[number];

/** An achievement's family, from its shape: a level, or the stat it counts. */
function groupOf(code: AchievementCode): Group {
  const definition = ACHIEVEMENTS.find((achievement) => achievement.code === code)!;
  if ('level' in definition) return 'levels';
  switch (definition.stat) {
    case 'bestStreak':
      return 'streaks';
    case 'challengesDone':
      return 'challenges';
    default:
      return 'lessons';
  }
}

/** One achievement: earned with its day, or greyed with its bar. */
async function AchievementCard({ item }: { item: Achievement }) {
  const t = await getTranslations('Gamification');
  const format = await getFormatter();
  const params = achievementParams(item.code);
  const title = t(`achievements.${item.code}.title`, params);
  const definition = ACHIEVEMENTS.find((achievement) => achievement.code === item.code)!;

  return (
    <li
      data-achievement={item.code}
      data-earned={item.day !== null}
      className={`flex flex-col gap-2 rounded-2xl border p-4 ${
        item.day === null
          ? 'border-slate-800 bg-slate-900/50'
          : 'border-green-500/40 bg-green-500/5'
      }`}
    >
      <div className="flex items-start gap-3">
        {item.day === null ? null : <DoneMark className="mt-0.5" />}
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            className={`font-semibold ${item.day === null ? 'text-slate-400' : 'text-slate-100'}`}
          >
            {title}
          </h3>
          <p className="text-sm text-slate-400">{t(`achievements.${item.code}.rule`, params)}</p>
        </div>
      </div>

      {item.day === null ? (
        <div className="flex flex-col gap-1.5">
          <span className="sr-only">{t('locked')}</span>
          <ProgressBar
            value={item.current}
            max={item.target}
            label={t('progressBar', { title })}
            className="[&>div]:bg-slate-500"
          />
          <p className="text-sm text-slate-500">
            {item.level !== null
              ? t('levelProgress', item.level)
              : t(`progress.${'stat' in definition ? definition.stat : 'finished'}`, {
                  current: item.current,
                  target: item.target,
                })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-green-300">
          {/* A course day, not an instant: formatted as written, whatever the reader's zone. */}
          {t('earnedOn', {
            date: format.dateTime(new Date(`${item.day}T00:00:00.000Z`), {
              dateStyle: 'long',
              timeZone: 'UTC',
            }),
          })}
        </p>
      )}
    </li>
  );
}

/** The ranks the rules list: enough to show how the steps grow. */
const SHOWN_RANKS = [1, 2, 3, 4, 5, 6];

/**
 * A rule and its amount, the amount aligned on the right like the XP card of
 * the results. `note` is a smaller line under the rule.
 */
function RuleRow({ rule, amount, note }: { rule: string; amount: string; note?: string }) {
  return (
    <div className="contents">
      <dt className="text-slate-200">
        {rule}
        {note === undefined ? null : <span className="block text-xs text-slate-500">{note}</span>}
      </dt>
      <dd className="text-right font-semibold text-indigo-300 tabular-nums">{amount}</dd>
    </div>
  );
}

const RULES = 'grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm';

/** The rules, every number from the shared constants. */
async function HowItWorks() {
  const t = await getTranslations('Gamification');
  const amount = (xp: number) => t('xpAmount', { xp });

  return (
    <section
      aria-labelledby="how-heading"
      // Its own scroller on a wide screen: focusable, so Safari's keyboard reaches the end of the rules.
      tabIndex={0}
      className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 lg:min-h-0 lg:overflow-y-auto"
    >
      <h2 id="how-heading" className="text-lg font-semibold text-slate-100">
        {t('howItWorks')}
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className={HEADING}>{t('xpHeading')}</h3>
        <dl className={RULES}>
          <RuleRow rule={t('ruleLesson')} note={t('ruleLessonNote')} amount={amount(LESSON_XP)} />
          <RuleRow rule={t('rulePoints')} note={t('rulePointsNote')} amount={amount(1)} />
          <RuleRow rule={t('ruleGoal')} amount={amount(GOAL_XP)} />
          <RuleRow rule={t('ruleChallenge')} amount={amount(CHALLENGE_XP)} />
        </dl>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5">
        <h3 className={HEADING}>{t('ranksHeading')}</h3>
        <dl className={RULES}>
          {SHOWN_RANKS.map((rank) => (
            <div key={rank} className="contents">
              <dt className="text-slate-200">{t('rankRow', { rank })}</dt>
              <dd className="text-right text-slate-300 tabular-nums">
                {t('rankFrom', { xp: rankStartOf(rank) })}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">{t('ranksNote', { step: RANK_STEP })}</p>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5">
        <h3 className={HEADING}>{t('challengesHeading')}</h3>
        <p className="text-sm text-slate-400">{t('challengesRule')}</p>
        <ul className="flex flex-col gap-1.5 text-sm text-slate-200">
          {CHALLENGES.map((code) => (
            <li key={code} className="flex gap-2">
              <span aria-hidden="true" className="text-indigo-400">
                •
              </span>
              {t(`challenges.${code}.rule`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5">
        <h3 className={HEADING}>{t('achievementsHeading')}</h3>
        <ul className="flex flex-col gap-1.5 text-sm text-slate-200">
          <li>{t('achievementsKept')}</li>
          <li>{t('achievementsPassed', { mark: LESSON_PASS_MARK })}</li>
        </ul>
      </div>
    </section>
  );
}
