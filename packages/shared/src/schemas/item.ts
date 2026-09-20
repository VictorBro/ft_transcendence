import { z } from 'zod';

import { LanguageSchema } from './language';

/**
 * Placement questions, as authored in `content/items/*.json` and seeded into
 * `QuestionBank`. One schema validates the files in CI and parses them at seed
 * time, so a malformed item is caught by whoever wrote it rather than by
 * whoever runs the migration. Authoring guide: docs/ITEM_BANK.md.
 *
 * The names below mirror the enums in schema.prisma, so a file, a row and a
 * type all describe a question in the same words.
 */

export const QUESTION_CATEGORIES = ['grammar', 'vocabulary', 'reading'] as const;
export const QuestionCategorySchema = z.enum(QUESTION_CATEGORIES);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

/** CEFR, from beginner to mastery. */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

/**
 * A closed list on purpose: it keys both the questions and the lesson topics,
 * so a question and the lesson that teaches it stay describable in the same
 * words.
 */
export const TOPICS = [
  'nouns_and_determiners',
  'pronouns',
  'verbs_morphology',
  'verb_usage',
  'syntax_and_sentence_structure',
  'subordinate_clauses',
  'prepositions_and_case',
  'adjectives',
  'adverbs',
  'agreement',
  'negation',
  'comparison_and_quantity',
  'information_structure_and_pragmatics',
] as const;
export const TopicSchema = z.enum(TOPICS);
export type Topic = z.infer<typeof TopicSchema>;

export const OPTIONS_PER_ITEM = 4;

/** The segment a sourceId must carry for a given category. */
export const CATEGORY_ID_SEGMENT: Record<QuestionCategory, string> = {
  grammar: 'gram',
  vocabulary: 'voca',
  reading: 'read',
};

/** `<language>-<3-letter category>-<4 digits>`, for example `en-gram-0001`. */
export const SOURCE_ID_PATTERN = /^[a-z]{2}-(gram|voca|read)-\d{4}$/;

/** Common fields shared by authored items and LLM-generated items. */
const BaseItemObject = z
  .object({
    level: LevelSchema,
    topic: TopicSchema,
    /** Reading questions only: the text the question is about. */
    readText: z.string().min(1).optional(),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
    answer: z.string().min(1),
    /** Seconds on the clock. The exam counts a timeout as a wrong answer. */
    timeLimitS: z.number().int().positive(),
  })
  .strict();

/** Output expected from the LLM (no sourceId, it will be set to null in DB). */
export const GeneratedItemSchema = BaseItemObject.refine(
  (item) => item.options.includes(item.answer),
  {
    message: 'answer must appear verbatim in options',
    path: ['answer'],
  },
).refine((item) => new Set(item.options).size === item.options.length, {
  message: 'options must all be different',
  path: ['options'],
});

export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

/** Authored item from content/items/*.json (requires a valid sourceId). */
export const ItemSchema = BaseItemObject.extend({
  sourceId: z.string().regex(SOURCE_ID_PATTERN, 'expected <lang>-<gram|voca|read>-<4 digits>'),
})
  // Stored as text rather than an index so options can be shuffled when served.
  .refine((item) => item.options.includes(item.answer), {
    message: 'answer must appear verbatim in options',
    path: ['answer'],
  })
  .refine((item) => new Set(item.options).size === item.options.length, {
    message: 'options must all be different',
    path: ['options'],
  });

export type Item = z.infer<typeof ItemSchema>;

export const ItemFileSchema = z
  .object({
    lang: LanguageSchema,
    category: QuestionCategorySchema,
    items: z.array(ItemSchema).min(1),
  })
  .strict()
  .refine((file) => new Set(file.items.map((i) => i.sourceId)).size === file.items.length, {
    message: 'sourceIds must be unique within the file',
    path: ['items'],
  })
  // A reading question without its text is unanswerable; a passage on a grammar
  // question is dead weight nobody will render.
  .refine(
    (file) => file.items.every((i) => (file.category === 'reading') === (i.readText !== undefined)),
    {
      message: 'reading questions need a readText, other categories must not have one',
      path: ['items'],
    },
  )
  // sourceIds are permanent and unique across every file, so one that disagrees
  // with its own file eventually collides with the file it belongs in.
  .refine(
    (file) =>
      file.items.every((i) =>
        i.sourceId.startsWith(`${file.lang}-${CATEGORY_ID_SEGMENT[file.category]}-`),
      ),
    {
      message:
        "every sourceId must start with the file's own language and category, e.g. en-gram-0001",
      path: ['items'],
    },
  );

export type ItemFile = z.infer<typeof ItemFileSchema>;

/** `content/items/<lang>-<category>.json`, the name the seed script globs. */
export function itemFileName(lang: string, category: QuestionCategory): string {
  return `${lang}-${category}.json`;
}
