import { getFormatter, getTranslations } from 'next-intl/server';
import {
  LESSON_GROUPS,
  LESSON_KINDS,
  LESSON_ROW_STATUSES,
  LESSON_SORTS,
  rowStatus,
  SORT_DIRECTIONS,
  THEMES,
  TOPICS,
  type CourseDay,
  type Language,
  type LessonCard,
  type LessonPage,
  type LessonQuery,
  type LessonRowStatus,
} from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/form';
import { groupRows, lessonsHref, previousDay } from '@/lib/lesson-list';
import { lessonPath } from '@/lib/lessons';

import { FoldDetails } from './fold-details';

// The course home's look (today.tsx) and the form fields' (components/form.tsx).
const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';
const CARD = 'rounded-2xl border border-slate-800 bg-slate-900';
const FIELD =
  'min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100';
const TEXT_LINK =
  'inline-flex min-h-11 items-center text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100';

/** The dot of each status: shape and label say it too, so colour is never alone. */
const STATUS_DOT: Record<LessonRowStatus, string> = {
  failed: 'bg-amber-400',
  todo: 'bg-slate-500',
  done: 'bg-green-400',
  soon: 'bg-slate-700',
};
const STATUS_TEXT: Record<LessonRowStatus, string> = {
  failed: 'text-amber-300',
  todo: 'text-slate-300',
  done: 'text-green-300',
  soon: 'text-slate-500',
};

/** A course day is a calendar date: formatted in UTC, it never moves by a day. */
async function dayFormatter(): Promise<(day: CourseDay) => string> {
  const format = await getFormatter();
  return (day) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
}

function Dot({ status }: { status: LessonRowStatus }) {
  return (
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
  );
}

/**
 * One list filter as checkboxes: the form sends the key once per box, which
 * LessonQuerySchema reads like a comma list.
 */
function Choices({
  name,
  checked,
  options,
}: {
  name: string;
  checked: string[];
  options: { value: string; label: string; status?: LessonRowStatus }[];
}) {
  return (
    <div className="flex flex-col">
      {options.map((option) => (
        <label
          key={option.value}
          className="-mx-2 flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/60 has-checked:text-slate-100"
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={checked.includes(option.value)}
            className="size-4 shrink-0 accent-slate-100"
          />
          {option.status === undefined ? null : <Dot status={option.status} />}
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** A long list of boxes, folded; open while one of its boxes is checked. */
function Fold({
  title,
  name,
  checked,
  options,
}: {
  title: string;
  name: string;
  checked: string[];
  options: { value: string; label: string }[];
}) {
  return (
    <FoldDetails checked={checked.length > 0} className="group/fold border-t border-slate-800 pt-4">
      <summary
        className={`${HEADING} flex min-h-8 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden`}
      >
        {title}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 transition-transform group-open/fold:rotate-180 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <fieldset className="mt-2">
        <legend className="sr-only">{title}</legend>
        <Choices name={name} checked={checked} options={options} />
      </fieldset>
    </FoldDetails>
  );
}

/**
 * The filter column. From lg it sits beside the list and stays in view. On a
 * phone it is a sheet over the page, opened by the #filters link: :target
 * needs no JavaScript, and LiveForm keeps the hash while the list updates.
 */
export async function LessonFilters({ query }: { query: LessonQuery }) {
  const t = await getTranslations('Lessons');
  const statuses = await getTranslations('LessonStatus');
  const kinds = await getTranslations('LessonKinds');
  const topics = await getTranslations('Topics');
  const themes = await getTranslations('Themes');
  const options = <T extends string>(values: readonly T[], label: (value: T) => string) =>
    values.map((value) => ({ value, label: label(value) }));

  return (
    <aside
      id="filters"
      aria-label={t('filters')}
      className="max-lg:hidden max-lg:target:fixed max-lg:target:inset-0 max-lg:target:z-50 max-lg:target:flex max-lg:target:flex-col max-lg:target:justify-end max-lg:target:bg-slate-950/70 lg:sticky lg:top-0 lg:w-60 lg:shrink-0"
    >
      <div className="flex max-h-[85dvh] flex-col gap-6 overflow-y-auto max-lg:rounded-t-2xl max-lg:border-t max-lg:border-slate-700 max-lg:bg-slate-900 max-lg:p-5">
        <div className="flex items-center justify-between lg:hidden">
          <h2 className="text-lg font-semibold">{t('filters')}</h2>
          <a href="#" className={TEXT_LINK}>
            {t('close')}
          </a>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${HEADING} mb-2`}>{t('status')}</legend>
          <Choices
            name="status"
            checked={query.status}
            options={LESSON_ROW_STATUSES.map((status) => ({
              value: status,
              label: statuses(status),
              status,
            }))}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${HEADING} mb-2`}>{t('kind')}</legend>
          <Choices
            name="kind"
            checked={query.kind}
            options={options(LESSON_KINDS, (k) => kinds(k))}
          />
        </fieldset>

        <Fold
          title={t('topics')}
          name="topic"
          checked={query.topic}
          options={options(TOPICS, (x) => topics(x))}
        />
        <Fold
          title={t('themes')}
          name="theme"
          checked={query.theme}
          options={options(THEMES, (x) => themes(x))}
        />

        {/* A submit, so the sheet applies its boxes without JavaScript; with it, LiveForm only closes the sheet.
            "?": a GET form keeps the page's #filters, which would leave the sheet open. */}
        <div className="flex flex-col lg:hidden">
          <button type="submit" formAction="?" data-close-sheet className={PRIMARY_BUTTON}>
            {t('showResults')}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      {label}
      {/* Not keyed on its value: a new node would drop the focus. LiveForm moves its default. */}
      <select name={name} defaultValue={value} className={FIELD}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The search, the sort, its direction and the group: how the list reads, not what is in it. */
export async function LessonToolbar({ query, total }: { query: LessonQuery; total: number }) {
  const t = await getTranslations('Lessons');
  const options = <T extends string>(values: readonly T[], label: (value: T) => string) =>
    values.map((value) => ({ value, label: label(value) }));
  const active = query.status.length + query.kind.length + query.topic.length + query.theme.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 focus-within:ring-2 focus-within:ring-slate-100">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">{t('search')}</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder={t('searchPlaceholder')}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>
        <div className="lg:hidden">
          <a href="#filters" className={SECONDARY_BUTTON}>
            {active === 0 ? t('filters') : t('filtersCount', { count: active })}
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          label={t('sort')}
          name="sort"
          value={query.sort}
          options={options(LESSON_SORTS, (sort) => t(`sorts.${sort}`))}
        />
        <Select
          label={t('dir')}
          name="dir"
          value={query.dir}
          options={options(SORT_DIRECTIONS, (dir) => t(`dirs.${dir}`))}
        />
        <Select
          label={t('group')}
          name="group"
          value={query.group}
          options={options(LESSON_GROUPS, (group) => t(`groups.${group}`))}
        />
        {/* Only without JavaScript: with it, LiveForm applies every change. */}
        <noscript>
          <button type="submit" className={PRIMARY_BUTTON}>
            {t('apply')}
          </button>
        </noscript>
      </div>
      <p role="status" className="text-sm text-slate-400">
        {t('count', { count: total })}
      </p>
    </div>
  );
}

/**
 * The active filters as chips, each a link to the same view without it, so
 * they work without JavaScript, then Clear filters.
 */
export async function ActiveFilters({ lang, query }: { lang: Language; query: LessonQuery }) {
  const t = await getTranslations('Lessons');
  const statuses = await getTranslations('LessonStatus');
  const kinds = await getTranslations('LessonKinds');
  const topics = await getTranslations('Topics');
  const themes = await getTranslations('Themes');
  const without = (patch: Partial<LessonQuery>) =>
    lessonsHref(lang, { ...query, ...patch, page: 1 });
  const chips = [
    ...(query.q === '' ? [] : [{ label: `“${query.q}”`, href: without({ q: '' }) }]),
    ...query.status.map((value) => ({
      label: statuses(value),
      href: without({ status: query.status.filter((v) => v !== value) }),
    })),
    ...query.kind.map((value) => ({
      label: kinds(value),
      href: without({ kind: query.kind.filter((v) => v !== value) }),
    })),
    ...query.topic.map((value) => ({
      label: topics(value),
      href: without({ topic: query.topic.filter((v) => v !== value) }),
    })),
    ...query.theme.map((value) => ({
      label: themes(value),
      href: without({ theme: query.theme.filter((v) => v !== value) }),
    })),
  ];
  if (chips.length === 0) return null;

  return (
    <ul aria-label={t('activeFilters')} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.href}>
          <Link
            href={chip.href}
            aria-label={t('removeFilter', { label: chip.label })}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-700 py-1 pr-2 pl-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            {chip.label}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </li>
      ))}
      <li>
        <Link href={`/learn/${lang}/lessons`} className={TEXT_LINK}>
          {t('clear')}
        </Link>
      </li>
    </ul>
  );
}

/**
 * One lesson. Ready, the whole row links to the lesson page (#146). Not
 * ready, it is greyed, Coming soon, with no score, no day and no link.
 */
async function LessonRow({ card, lang }: { card: LessonCard; lang: Language }) {
  const formatDay = await dayFormatter();
  const t = await getTranslations('Lessons');
  const statuses = await getTranslations('LessonStatus');
  const kinds = await getTranslations('LessonKinds');
  const topics = await getTranslations('Topics');
  const themes = await getTranslations('Themes');
  const status = rowStatus(card);
  const classification =
    card.topic !== null ? topics(card.topic) : card.theme !== null ? themes(card.theme) : null;
  const scored = card.ready && card.score !== null && card.day !== null;

  const content = (
    <>
      <span className="w-8 shrink-0 text-sm font-semibold text-slate-500 tabular-nums">
        #{card.position}
      </span>
      <span className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <span
          lang={lang}
          className={`font-medium ${card.ready ? 'text-slate-100' : 'text-slate-400'}`}
        >
          {card.title}
        </span>
        <span lang={lang} className="truncate text-sm text-slate-400">
          {card.summary}
        </span>
        <span className="text-xs text-slate-500">
          {classification === null
            ? kinds(card.kind)
            : t('classified', { kind: kinds(card.kind), label: classification })}
        </span>
      </span>
      <span className="ml-11 flex shrink-0 items-center gap-6 sm:ml-0">
        <span className="flex w-36 flex-col gap-0.5">
          <span className={`inline-flex items-center gap-2 text-sm ${STATUS_TEXT[status]}`}>
            <Dot status={status} />
            {statuses(status)}
          </span>
          {scored ? <span className="text-xs text-slate-500">{formatDay(card.day!)}</span> : null}
        </span>
        <span className="w-12 text-right text-sm font-semibold text-slate-100 tabular-nums">
          {scored ? (
            <>
              <span className="sr-only">{t('bestScore')}: </span>
              {card.score}%
            </>
          ) : null}
        </span>
      </span>
    </>
  );
  const row = 'flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4';

  return (
    <li data-lesson={card.id} className="border-t border-slate-800 first:border-t-0">
      {card.ready ? (
        // No prefetch: a row the learner only sees is not a lesson opened.
        <Link
          href={lessonPath(lang, card.id)}
          prefetch={false}
          className={`${row} transition-colors outline-none hover:bg-slate-800/50 focus-visible:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-slate-100 focus-visible:ring-inset`}
        >
          {content}
        </Link>
      ) : (
        <div className={`${row} opacity-70`}>{content}</div>
      )}
    </li>
  );
}

/**
 * The rows in blocks, one per group, in the API's order: a header goes before
 * the first row of the page and wherever the group changes.
 */
export async function LessonRows({
  page,
  lang,
  group,
}: {
  page: LessonPage;
  lang: Language;
  group: LessonQuery['group'];
}) {
  const formatDay = await dayFormatter();
  const t = await getTranslations('Lessons');
  const statuses = await getTranslations('LessonStatus');
  const kinds = await getTranslations('LessonKinds');
  // For day, the key is a course day, or todo and soon for rows with none.
  const header = (key: string) => {
    if (group === 'status' || key === 'todo' || key === 'soon') return statuses(key);
    if (group === 'kind') return kinds(key);
    if (key === page.day) return t('today');
    if (key === previousDay(page.day)) return t('yesterday');
    return formatDay(key);
  };

  return (
    // Fades while LiveForm's transition renders the next view.
    <div className="flex flex-col gap-4 transition-opacity group-data-pending:opacity-50 motion-reduce:transition-none">
      {groupRows(page.items, group).map((run) => (
        <section key={run.key} className={`${CARD} overflow-hidden`}>
          {group === 'none' ? null : (
            <h2 className={`${HEADING} border-b border-slate-800 bg-slate-950/40 px-5 py-3`}>
              {header(run.key)}
            </h2>
          )}
          <ol>
            {run.cards.map((card) => (
              <LessonRow key={card.id} card={card} lang={lang} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Numbered page links that keep every other param, with previous, next and the range shown. */
export async function LessonPager({
  page,
  lang,
  query,
}: {
  page: LessonPage;
  lang: Language;
  query: LessonQuery;
}) {
  const t = await getTranslations('Lessons');
  const last = Math.max(1, Math.ceil(page.total / page.pageSize));
  const from = (page.page - 1) * page.pageSize + 1;
  const to = from + page.items.length - 1;
  const href = (number: number) => lessonsHref(lang, { ...query, page: number });
  const box =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm transition-colors';
  const step = (number: number, label: string) =>
    number < 1 || number > last ? (
      <span className={`${box} text-slate-600`}>{label}</span>
    ) : (
      <Link href={href(number)} className={`${box} text-slate-300 hover:bg-slate-800`}>
        {label}
      </Link>
    );

  return (
    <nav aria-label={t('pages')} className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-sm text-slate-400">{t('range', { from, to, total: page.total })}</p>
      {last > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          {step(page.page - 1, t('previous'))}
          {Array.from({ length: last }, (_, i) => i + 1).map((number) =>
            number === page.page ? (
              <span
                key={number}
                aria-current="page"
                className={`${box} bg-slate-100 font-semibold text-slate-900`}
              >
                {number}
              </span>
            ) : (
              <Link
                key={number}
                href={href(number)}
                className={`${box} text-slate-400 hover:bg-slate-800 hover:text-slate-100`}
              >
                {number}
              </Link>
            ),
          )}
          {step(page.page + 1, t('next'))}
        </div>
      ) : null}
    </nav>
  );
}
