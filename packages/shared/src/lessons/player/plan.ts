import type { Language } from '../../schemas/language';
import type { Locale } from '../../schemas/locale';
import type { AcceptedAnswers, LocalizedText } from '../schemas/artifactCommon';
import type { Brief, LessonContent } from '../schemas/artifacts';
import type { FunctionsItem } from '../schemas/functions';
import type { GrammarItem } from '../schemas/grammar';
import type { ReadingItem } from '../schemas/reading';
import type { Gender, VocabularyItem } from '../schemas/vocabulary';
import { DISCUSSION_SECONDS, EXAM_INTRO_SECONDS, PLAYER_COPY } from './copy';
import { kindModule } from './kinds';

/**
 * The plan of one attempt: the lesson flattened into the pages the
 * learner goes through, in order, each with its answer units.
 *
 *   lesson file              plan
 *   steps[] ─ pages[]   →    pages[] ─ units[]
 *                            (one unit = one answer, scored 0, 0.5 or 1)
 *
 * The server builds it from the lesson row on every request (#145) and
 * never stores it: everything an attempt stores (the answers, the cursor)
 * points into it by unit id and page index. It holds every key, so it
 * never leaves the server; view.ts says what the browser may see.
 *
 * What a kind does differently (its units, how its pages are arranged,
 * its outline sections) lives in its module in kinds/. This file never
 * asks which kind a lesson is.
 */

/**
 * What a page is for:
 * - presentation: something to read, nothing to answer;
 * - practice: exercises, corrected page by page;
 * - discussion: the unscored page before the exam (#150 fills it);
 * - examIntro: the exam info page;
 * - exam: a timed page, corrected only in the results.
 */
export type PageRole = 'presentation' | 'practice' | 'discussion' | 'examIntro' | 'exam';

/** An item of any kind's lesson file. */
export type Item = VocabularyItem | GrammarItem | FunctionsItem | ReadingItem;
export type ItemType = Item['type'];

/**
 * One option of a choice, or one token of an order or a spot. `lang`
 * says how to render its text: in the course language (learning), in
 * the mother tongue (native), or as an interface message (ui: a gender).
 */
export interface Option {
  id: string;
  text: string;
  lang: 'learning' | 'native' | 'ui';
}

/** How a unit is asked: a line in each language, and the text around a gap. */
export interface Prompt {
  learning?: string;
  native?: string;
  before?: string;
  after?: string;
}

interface UnitBase {
  /** `<pageId>/<itemId>`, plus a suffix when an item has several units. Never sent. */
  id: string;
  itemId: string;
  itemType: ItemType;
  /** Already in the attempt's languages. */
  prompt: Prompt;
  /** Why the answer is right, shown with the feedback or in the results. */
  explanation: LocalizedText;
  /** The teaching answer, shown with the feedback and in the results. */
  answer: string;
  answerLang: Option['lang'];
  /** A gender row: the word's teaching form (un livre) and translation, shown once checked. */
  form?: string;
  translation?: string;
  /** Course-language text the audio control reads aloud. */
  speak?: string;
  /** Grammar: the rules the item practises. */
  ruleIds?: string[];
}

/**
 * A noun of a translation exam. Typing "des" + a word asks for its
 * gender: only a plurale tantum (a noun taught with "des") is examined in
 * the plural, and its answer then counts only with a right gender.
 */
export interface NounGender {
  genders: Gender[];
  pluraleTantum: boolean;
}

/** One answer of the learner: typed text, one option, an order of tokens, or a token and its correction. */
export type PlanUnit =
  | (UnitBase & { kind: 'text'; accepted: AcceptedAnswers; noun?: NounGender })
  | (UnitBase & { kind: 'choice'; options: Option[]; correct: string[] })
  /** `distractors`: tokens that belong to no accepted order (function exam replies). */
  | (UnitBase & {
      kind: 'order';
      tokens: Option[];
      acceptedOrders: string[][];
      distractors?: string[];
    })
  | (UnitBase & {
      kind: 'spot';
      tokens: Option[];
      faultyTokenId: string;
      correction: { mode: 'type' | 'select'; accepted: AcceptedAnswers; choices: string[] };
    });
export type UnitKind = PlanUnit['kind'];

export interface PlanPage {
  index: number;
  pageId: string;
  stepId: string;
  stepLabel: LocalizedText;
  role: PageRole;
  estimatedDurationS: number;
  timeLimitS: number | null;
  instructions: LocalizedText;
  items: Item[];
  units: PlanUnit[];
  /** Grammar: the teaching block of the page's step; null otherwise. */
  blockId: string | null;
}

export interface LessonPlan {
  lessonId: string;
  lang: Language;
  kind: Brief['kind'];
  title: string;
  objective: LocalizedText;
  motherTongue: Locale;
  pages: PlanPage[];
  /** The lesson the plan was built from, for the page views (redact.ts). */
  brief: Brief;
  content: LessonContent;
}

/**
 * One lesson as the API stores it: its brief, and its content file, null
 * for a vocabulary lesson (built from the brief).
 */
export interface LessonSource {
  brief: Brief;
  content: LessonContent | null;
}

/** true when the page's answers count: practice and exam pages. */
export const isScored = (page: Pick<PlanPage, 'role'>) =>
  page.role === 'practice' || page.role === 'exam';

/**
 * Builds the plan of one attempt. `motherTongue` (see motherTongue.ts)
 * picks the native prompts and labels; it is fixed for the attempt.
 *
 * The steps are the same in every kind:
 * 1. the kind module builds the units of each item and arranges its pages;
 * 2. a page with units is practice, one without is presentation, and every
 *    page of the exam step is exam;
 * 3. the discussion page is added before the exam, unless the kind already
 *    placed one (grammar turns its feedback placeholder into it);
 * 4. the exam info page goes right before the first exam page.
 */
export function buildPlan(lesson: LessonSource, motherTongue: Locale): LessonPlan {
  const kind = kindModule(lesson.brief.kind);
  const content = kind.content(lesson.brief, lesson.content);
  const unitsOf = kind.units(lesson.brief, content, motherTongue);

  let pages: PlanPage[] = [];
  for (const step of content.steps) {
    for (const page of step.pages) {
      const items = page.items as Item[];
      const units = items.flatMap((item) => {
        const id = (suffix = '') => `${page.pageId}/${item.itemId}${suffix}`;
        const ruleIds = 'ruleIds' in item ? { ruleIds: item.ruleIds } : {};
        return unitsOf(item, id).map((u) => ({ ...u, ...ruleIds }));
      });
      pages.push({
        index: pages.length,
        pageId: page.pageId,
        stepId: step.id,
        stepLabel: step.label,
        role: step.role === 'exam' ? 'exam' : units.length ? 'practice' : 'presentation',
        estimatedDurationS: page.estimatedDurationS,
        timeLimitS: page.timeLimitS,
        instructions: page.instructions,
        items,
        units,
        blockId: 'blockId' in step ? step.blockId : null,
      });
    }
  }
  pages = kind.arrange(pages);
  pages = withExamIntro(withDiscussion(pages));
  pages.forEach((p, n) => (p.index = n));

  return {
    lessonId: content.id,
    lang: content.lang,
    kind: content.kind,
    title: content.title,
    objective: content.objective,
    motherTongue,
    pages,
    brief: lesson.brief,
    content,
  };
}

/**
 * A page of the player's own, with no items: the discussion page and the
 * exam info page.
 */
export function playerPage(
  role: 'discussion' | 'examIntro',
  pageId: string,
  stepId: string,
  label: LocalizedText,
  instructions: LocalizedText,
  estimatedDurationS: number,
): PlanPage {
  return {
    index: 0,
    pageId,
    stepId,
    stepLabel: label,
    role,
    estimatedDurationS,
    timeLimitS: null,
    instructions,
    items: [],
    units: [],
    blockId: null,
  };
}

/** Adds the discussion page before the first exam page, when the kind has not placed one. */
function withDiscussion(pages: PlanPage[]): PlanPage[] {
  const first = pages.findIndex((p) => p.role === 'exam');
  if (first < 0 || pages.some((p) => p.role === 'discussion')) return pages;
  const [label, instructions] = PLAYER_COPY.discussion;
  const page = playerPage(
    'discussion',
    'discussion',
    'discussion',
    label,
    instructions,
    DISCUSSION_SECONDS,
  );
  return [...pages.slice(0, first), page, ...pages.slice(first)];
}

/**
 * Adds the exam info page right before the first exam page. It lists the
 * exam pages with their questions and countdowns (the outline has them),
 * so it holds nothing itself.
 */
function withExamIntro(pages: PlanPage[]): PlanPage[] {
  const first = pages.findIndex((p) => p.role === 'exam');
  if (first < 0) return pages;
  const exam = pages[first];
  const page = playerPage(
    'examIntro',
    'exam-intro',
    exam.stepId,
    exam.stepLabel,
    exam.stepLabel,
    EXAM_INTRO_SECONDS,
  );
  return [...pages.slice(0, first), page, ...pages.slice(first)];
}

/**
 * The tokens and accepted orders of a word order. The full stop that
 * ends every accepted sentence is not a token to place: it is left out
 * (a "?" or "!", or punctuation inside the sentence, stays a token).
 */
export function wordOrder(item: {
  tokens: { tokenId: string; text: string }[];
  acceptedOrders: string[][];
}) {
  const last = item.acceptedOrders[0].at(-1);
  const stop =
    item.tokens.some((t) => t.tokenId === last && t.text === '.') &&
    item.acceptedOrders.every((o) => o.at(-1) === last)
      ? last
      : undefined;
  const tokens = item.tokens
    .filter((t) => t.tokenId !== stop)
    .map((t) => ({ id: t.tokenId, text: t.text, lang: 'learning' as const }));
  const acceptedOrders = item.acceptedOrders.map((o) => o.filter((tid) => tid !== stop));
  const answer = acceptedOrders[0]
    .map((tid) => tokens.find((t) => t.id === tid)?.text ?? '')
    .join(' ');
  return { tokens, acceptedOrders, answer };
}

/** The gender options of a gender row: neuter only in German. */
export function genderOptions(lang: string): Option[] {
  const genders: Gender[] =
    lang === 'de' ? ['masculine', 'feminine', 'neuter'] : ['masculine', 'feminine'];
  return genders.map((g) => ({ id: g, text: g, lang: 'ui' }));
}

/** A native text in the mother tongue, or the first one there is. */
export const inMotherTongue = (
  map: Partial<Record<Locale, string>> | null | undefined,
  motherTongue: Locale,
) => map?.[motherTongue] ?? Object.values(map ?? {})[0] ?? '';
