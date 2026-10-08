import { z } from 'zod';

import { type Level, LevelSchema, TOPICS, TopicSchema } from './item';
import { type Language, LanguageSchema, LEARNABLE_LANGUAGES } from './language';

/**
 * Lessons: the syllabus authored in content/outlines/*.json and
 * content/lessons/*.json, and what the API serves about them. One schema
 * validates the files in CI, parses them at seed time and checks the
 * generator's output, so a malformed lesson fails for whoever wrote it.
 *
 * `TOPICS` stays in ./item: grammar lessons and placement questions share it.
 */

export const LESSON_KINDS = ['grammar', 'vocabulary', 'functions', 'reading'] as const;
export const LessonKindSchema = z.enum(LESSON_KINDS);
export type LessonKind = z.infer<typeof LessonKindSchema>;

/** The Threshold Level themes. Every lesson but a grammar one has exactly one. */
export const THEMES = [
  'personal_identification',
  'house_and_home',
  'daily_life',
  'free_time',
  'travel',
  'relations',
  'health',
  'education',
  'shopping',
  'food_and_drink',
  'services',
  'places',
  'language',
  'weather',
] as const;
export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

/** One lesson is ten minutes, so a daily goal of 30 minutes is three lessons. */
export const LESSON_MINUTES = 10;
/** Lessons offered beyond the day's target. */
export const EXTRA_COUNT = 3;
/** A best score at or above this passes the lesson. */
export const LESSON_PASS_MARK = 70;
/** The share of a level's lessons a learner must pass to complete it. */
export const LEVEL_PASS_SHARE = 0.8;
export const LESSONS_PAGE_SIZE = 20;

/** The same for every language. */
export const LESSONS_PER_LEVEL: Record<Level, number> = {
  A1: 120,
  A2: 150,
  B1: 230,
  B2: 250,
  C1: 260,
  C2: 320,
};

/** German and French share one mix. */
const DE_FR_KIND_COUNTS: Record<Level, Record<LessonKind, number>> = {
  A1: { grammar: 48, vocabulary: 48, functions: 14, reading: 10 },
  A2: { grammar: 60, vocabulary: 52, functions: 18, reading: 20 },
  B1: { grammar: 68, vocabulary: 100, functions: 22, reading: 40 },
  B2: { grammar: 50, vocabulary: 125, functions: 30, reading: 45 },
  C1: { grammar: 26, vocabulary: 130, functions: 32, reading: 72 },
  C2: { grammar: 26, vocabulary: 166, functions: 32, reading: 96 },
};

/**
 * How many lessons of each kind a level has, per language. Each row sums to
 * LESSONS_PER_LEVEL, and the outline check wants these numbers exactly.
 * German and French have more grammar from A1 to B1, English more vocabulary
 * from B1 to C2.
 */
export const KIND_COUNTS: Record<Language, Record<Level, Record<LessonKind, number>>> = {
  de: DE_FR_KIND_COUNTS,
  fr: DE_FR_KIND_COUNTS,
  en: {
    A1: { grammar: 42, vocabulary: 54, functions: 14, reading: 10 },
    A2: { grammar: 50, vocabulary: 60, functions: 20, reading: 20 },
    B1: { grammar: 46, vocabulary: 122, functions: 22, reading: 40 },
    B2: { grammar: 38, vocabulary: 136, functions: 30, reading: 46 },
    C1: { grammar: 14, vocabulary: 142, functions: 30, reading: 74 },
    C2: { grammar: 16, vocabulary: 182, functions: 32, reading: 90 },
  },
};

/**
 * Languages whose six lesson files are all written. The lesson file check
 * fails when one of these is missing a level; any other language may be
 * part-way through authoring.
 */
export const COMPLETE_LANGUAGES: readonly Language[] = [];

/**
 * `<lang>-<english words>`, e.g. `de-separable-verbs`. No level in it, so a
 * lesson can move level with a simple edit. It is Lesson's primary key, so it
 * never changes once shipped.
 */
export const LESSON_ID_MAX = 64;
export const LESSON_ID_PATTERN = new RegExp(
  `^(${LEARNABLE_LANGUAGES.join('|')})-[a-z]+(-[a-z]+)*$`,
);
export const LessonIdSchema = z
  .string()
  .max(LESSON_ID_MAX)
  .regex(LESSON_ID_PATTERN, 'expected <lang>-<words>: lowercase letters and hyphens');
export type LessonId = z.infer<typeof LessonIdSchema>;

/** Quoted by the generator's prompt, so exported rather than inlined. */
export const LESSON_TITLE_MAX = 80;
export const LESSON_SUMMARY_MAX = 200;
export const BRIEF_TEXT_MAX = 300;
export const VOCABULARY_TERM_MAX = 60;
export const VOCABULARY_GLOSS_MAX = 120;
export const BRIEF_POINTS = { min: 2, max: 6 } as const;
export const BRIEF_EXAMPLES = { min: 3, max: 8 } as const;
export const BRIEF_PITFALLS = { min: 1, max: 4 } as const;
export const BRIEF_VOCABULARY = { min: 6, max: 15 } as const;

/**
 * Control characters (newlines and tabs included) and the invisible ones
 * trim() leaves: zero-width space, joiners, byte order mark. Model output can
 * carry them, and none belongs in a one-line text.
 */
const HIDDEN_CHARACTER = /[\p{Cc}\u200b-\u200d\ufeff]/u;

/**
 * Plain one-line text that is already trimmed. Rejected rather than trimmed,
 * so the files stay canonical: the generator trims the model's output itself.
 */
function text(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s === s.trim(), 'must not start or end with whitespace')
    .refine(
      (s) => !HIDDEN_CHARACTER.test(s),
      'must not contain line breaks or invisible characters',
    );
}

export const LessonTitleSchema = text(LESSON_TITLE_MAX);
export const LessonSummarySchema = text(LESSON_SUMMARY_MAX);

/**
 * The only fold: the title check, the generator's clash check and the search
 * all compare text through it. NFD turns umlauts into their bare vowel, so
 * `Madchen` finds `Mädchen`; the letters NFD cannot split are spelled out.
 */
const FOLDED_LETTERS = {
  ß: 'ss',
  œ: 'oe',
  æ: 'ae',
} as const;
type FoldedLetter = keyof typeof FOLDED_LETTERS;
const FOLDED_LETTER = new RegExp(`[${Object.keys(FOLDED_LETTERS).join('')}]`, 'g');

export function foldText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(FOLDED_LETTER, (letter) => FOLDED_LETTERS[letter as FoldedLetter])
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** All of it in the course language. A gloss defines, it never translates. */
export const VocabularyEntrySchema = z.strictObject({
  term: text(VOCABULARY_TERM_MAX),
  gloss: text(VOCABULARY_GLOSS_MAX),
});
export type VocabularyEntry = z.infer<typeof VocabularyEntrySchema>;

export const LessonBriefSchema = z.strictObject({
  objective: text(BRIEF_TEXT_MAX),
  points: z.array(text(BRIEF_TEXT_MAX)).min(BRIEF_POINTS.min).max(BRIEF_POINTS.max),
  examples: z.array(text(BRIEF_TEXT_MAX)).min(BRIEF_EXAMPLES.min).max(BRIEF_EXAMPLES.max),
  pitfalls: z.array(text(BRIEF_TEXT_MAX)).min(BRIEF_PITFALLS.min).max(BRIEF_PITFALLS.max),
  /**
   * The one optional part of the brief: LessonDraftEntrySchema requires it on
   * vocabulary lessons, the other kinds may leave it out.
   */
  vocabulary: z
    .array(VocabularyEntrySchema)
    .min(BRIEF_VOCABULARY.min)
    .max(BRIEF_VOCABULARY.max)
    .optional(),
});
export type LessonBrief = z.infer<typeof LessonBriefSchema>;

/** Grammar lessons have a topic, every other kind a theme, never both. */
function hasItsClassification(entry: {
  kind: LessonKind;
  topic?: unknown;
  theme?: unknown;
}): boolean {
  return entry.kind === 'grammar'
    ? entry.topic != null && entry.theme == null
    : entry.theme != null && entry.topic == null;
}

const CLASSIFICATION_ISSUE = {
  message: 'grammar needs a topic and no theme, other kinds a theme and no topic',
  path: ['kind'],
};

const classification = {
  id: LessonIdSchema,
  kind: LessonKindSchema,
  topic: TopicSchema.optional(),
  theme: ThemeSchema.optional(),
};

/** One line of a level's plan, before the lesson is written. */
export const LessonOutlineEntrySchema = z
  .strictObject({
    ...classification,
    workingTitle: LessonTitleSchema,
    intent: LessonSummarySchema,
  })
  .refine(hasItsClassification, CLASSIFICATION_ISSUE);
export type LessonOutlineEntry = z.infer<typeof LessonOutlineEntrySchema>;

/** What the generator asks the model for. */
export const LessonDraftSchema = z.strictObject({
  title: LessonTitleSchema,
  summary: LessonSummarySchema,
  brief: LessonBriefSchema,
});
export type LessonDraft = z.infer<typeof LessonDraftSchema>;

/**
 * The outline's classification plus the draft. No lang, level or position:
 * the seed takes them from the file and the entry's place in it.
 */
export const LessonDraftEntrySchema = z
  .strictObject({ ...classification, ...LessonDraftSchema.shape })
  .refine(hasItsClassification, CLASSIFICATION_ISSUE)
  .refine((entry) => entry.kind !== 'vocabulary' || entry.brief.vocabulary !== undefined, {
    message: 'vocabulary lessons need brief.vocabulary',
    path: ['brief', 'vocabulary'],
  });
export type LessonDraftEntry = z.infer<typeof LessonDraftEntrySchema>;

/**
 * Ids start with the file's own language and are unique in the file. Reported
 * on the entry, so a failure points at the line to fix.
 */
function checkIds(lang: Language, ids: string[], key: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (!id.startsWith(`${lang}-`)) {
      ctx.addIssue({
        code: 'custom',
        message: `id must start with the file's language: ${lang}-`,
        path: [key, index, 'id'],
      });
    }
    if (seen.has(id)) {
      ctx.addIssue({ code: 'custom', message: 'id used twice', path: [key, index, 'id'] });
    }
    seen.add(id);
  });
}

/** content/outlines/<lang>-<level>.json. */
export const LessonOutlineFileSchema = z
  .strictObject({
    lang: LanguageSchema,
    level: LevelSchema,
    entries: z.array(LessonOutlineEntrySchema).min(1),
  })
  .superRefine((file, ctx) => {
    checkIds(
      file.lang,
      file.entries.map((entry) => entry.id),
      'entries',
      ctx,
    );
  });
export type LessonOutlineFile = z.infer<typeof LessonOutlineFileSchema>;

/** content/lessons/<lang>-<level>.json, in the same order as its outline. */
export const LessonDraftFileSchema = z
  .strictObject({
    lang: LanguageSchema,
    level: LevelSchema,
    drafts: z.array(LessonDraftEntrySchema).min(1),
  })
  .superRefine((file, ctx) => {
    checkIds(
      file.lang,
      file.drafts.map((draft) => draft.id),
      'drafts',
      ctx,
    );
  });
export type LessonDraftFile = z.infer<typeof LessonDraftFileSchema>;

/** `content/outlines/<lang>-<level>.json`, e.g. `de-a1.json`. */
export function outlineFileName(lang: string, level: Level): string {
  return `${lang}-${level.toLowerCase()}.json`;
}

/** `content/lessons/<lang>-<level>.json`, e.g. `de-a1.json`. */
export function lessonFileName(lang: string, level: Level): string {
  return `${lang}-${level.toLowerCase()}.json`;
}

/* ------------------------------------------------------------------------- */
/* API. A field that can be absent is nullable, never optional.              */
/* ------------------------------------------------------------------------- */

/** YYYY-MM-DD, the learner's course day in their time zone. */
export const CourseDaySchema = z.iso.date();
export type CourseDay = z.infer<typeof CourseDaySchema>;

/** No result: todo. A best score at or above LESSON_PASS_MARK: done. Else failed. */
export const LESSON_STATUSES = ['todo', 'failed', 'done'] as const;
export const LessonStatusSchema = z.enum(LESSON_STATUSES);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

const ScoreSchema = z.number().int().min(0).max(100);

function statusOf(best: number | null): LessonStatus {
  if (best === null) return 'todo';
  return best >= LESSON_PASS_MARK ? 'done' : 'failed';
}

/**
 * A lesson in a list, without its brief. Strict, so a payload that still
 * carries the brief fails the parse instead of shipping it unnoticed.
 */
export const LessonCardSchema = z
  .strictObject({
    id: LessonIdSchema,
    level: LevelSchema,
    /** From 1, the entry's place in its file. */
    position: z.number().int().positive(),
    kind: LessonKindSchema,
    topic: TopicSchema.nullable(),
    theme: ThemeSchema.nullable(),
    title: LessonTitleSchema,
    summary: LessonSummarySchema,
    status: LessonStatusSchema,
    /** The best score. Null, like day and finishedAt, for a lesson never started. */
    score: ScoreSchema.nullable(),
    /** The course day of the last finish. */
    day: CourseDaySchema.nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .refine(hasItsClassification, CLASSIFICATION_ISSUE)
  .refine(
    (card) =>
      [card.score, card.day, card.finishedAt].every(
        (field) => (field === null) === (card.score === null),
      ),
    { message: 'score, day and finishedAt are all null or all set', path: ['score'] },
  )
  .refine((card) => card.status === statusOf(card.score), {
    message: `status must follow the score: none is todo, ${LESSON_PASS_MARK} or more is done, less is failed`,
    path: ['status'],
  });
export type LessonCard = z.infer<typeof LessonCardSchema>;

const countSchema = z.number().int().min(0);

export const TodaySchema = z.object({
  day: CourseDaySchema,
  /** Lessons a day: the daily goal over LESSON_MINUTES. */
  target: z.number().int().positive(),
  met: z.boolean(),
  done: z.array(LessonCardSchema),
  proposed: z.array(LessonCardSchema),
  extra: z.array(LessonCardSchema),
  streak: z.object({
    current: countSchema,
    best: countSchema,
    /** Whether today already counts. */
    today: z.boolean(),
  }),
  progress: z.object({
    total: countSchema,
    attempted: countSchema,
    passed: countSchema,
    needed: countSchema,
    complete: z.boolean(),
  }),
  /** Null after C2. */
  levelAfter: LevelSchema.nullable(),
});
export type Today = z.infer<typeof TodaySchema>;

export const LESSON_SORTS = ['position', 'score', 'finishedAt'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const LESSON_GROUPS = ['none', 'status', 'day', 'kind'] as const;
export const LESSON_QUERY_MAX = 100;

/** `a,b,c`: unknown values are dropped, never rejected. */
function commaList<const T extends readonly [string, ...string[]]>(values: T) {
  const allowed = new Set<string>(values);
  return z
    .string()
    .transform((list) => [
      ...new Set(
        list
          .split(',')
          .map((value) => value.trim())
          .filter((value): value is T[number] => allowed.has(value)),
      ),
    ])
    .catch([]);
}

/**
 * The all lessons page's search params. Lists are comma separated, because
 * apiGet sets each key once (apps/web/lib/api.ts). Every field falls back to its
 * default, so the API and the page read a hand-edited URL the same way and
 * neither ever fails on one.
 */
export const LessonQuerySchema = z.object({
  q: z
    .string()
    // Cut by code point, so an emoji is never split, and trim again after the cut.
    .transform((q) => [...q.trim()].slice(0, LESSON_QUERY_MAX).join('').trim())
    .catch(''),
  status: commaList(LESSON_STATUSES),
  kind: commaList(LESSON_KINDS),
  topic: commaList(TOPICS),
  theme: commaList(THEMES),
  sort: z.enum(LESSON_SORTS).catch('position'),
  dir: z.enum(SORT_DIRECTIONS).catch('asc'),
  group: z.enum(LESSON_GROUPS).catch('none'),
  // Digits only: Number() would read 0x10 as 16 and 1e2 as 100.
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1)).catch(1),
});
export type LessonQuery = z.infer<typeof LessonQuerySchema>;

export const LessonPageSchema = z.object({
  /** The course day, so the page can label Today and Yesterday. */
  day: CourseDaySchema,
  /** The level's lessons before any filter. */
  levelTotal: countSchema,
  items: z.array(LessonCardSchema),
  /** The lessons that match the filters. */
  total: countSchema,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type LessonPage = z.infer<typeof LessonPageSchema>;

export const FinishLessonSchema = z.object({
  score: z
    .number({ error: 'lesson.invalidScore' })
    .int('lesson.invalidScore')
    .min(0, 'lesson.invalidScore')
    .max(100, 'lesson.invalidScore'),
});
export type FinishLessonInput = z.infer<typeof FinishLessonSchema>;

export const FinishResultSchema = z.object({
  /** The lesson had no result on the course day before this finish. */
  countedToday: z.boolean(),
  /** That day's count after this finish. */
  doneCount: countSchema,
  target: z.number().int().positive(),
  /** Only when this call wrote the streak. */
  goalJustMet: z.boolean(),
});
export type FinishResult = z.infer<typeof FinishResultSchema>;
