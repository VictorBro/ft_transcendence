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

const questionFields = {
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
  answer: z.string().min(1),
};

// Stored as text rather than an index so options can be shuffled when served.
function withAnswerChecks<S extends z.ZodType<{ options: string[]; answer: string }>>(schema: S) {
  return schema
    .refine((item) => item.options.includes(item.answer), {
      message: 'answer must appear verbatim in options',
      path: ['answer'],
    })
    .refine((item) => new Set(item.options).size === item.options.length, {
      message: 'options must all be different',
      path: ['options'],
    });
}

/** Authored item from content/items/*.json (requires a valid sourceId). */
export const ItemSchema = withAnswerChecks(
  z
    .object({
      sourceId: z.string().regex(SOURCE_ID_PATTERN, 'expected <lang>-<gram|voca|read>-<4 digits>'),
      level: LevelSchema,
      topic: TopicSchema,
      /** Reading questions only: the text the question is about. */
      readText: z.string().min(1).optional(),
      ...questionFields,
      /** Seconds on the clock. The exam counts a timeout as a wrong answer. */
      timeLimitS: z.number().int().positive(),
    })
    .strict(),
);

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

/** Every reading question carries this topic. */
export const READING_TOPIC = 'information_structure_and_pragmatics' satisfies Topic;

/** Where a vocabulary question files: its word class, or pragmatics for set phrases. */
export const VOCABULARY_TOPICS = [
  'nouns_and_determiners',
  'verb_usage',
  'adjectives',
  'adverbs',
  'prepositions_and_case',
  'information_structure_and_pragmatics',
] as const satisfies readonly Topic[];

/** Reading questions each need their own passage, so a reading batch stays small. */
export const READING_BATCH_SIZE = 5;
export const VOCABULARY_BATCH_SIZE = 10;

/** A generated question of any category: an authored item minus what the server sets. */
export type GeneratedItem = Omit<Item, 'sourceId' | 'level' | 'timeLimitS'>;
export type GeneratedBatch = { items: GeneratedItem[] };

// Not strict: a key the model adds is dropped rather than failing the batch.
// Level and time limit come from the cell being restocked, never from the model.
const GrammarItemSchema = withAnswerChecks(z.object({ topic: TopicSchema, ...questionFields }));
const VocabularyItemSchema = withAnswerChecks(
  z.object({ topic: z.enum(VOCABULARY_TOPICS), ...questionFields }),
);
const ReadingItemSchema = withAnswerChecks(
  z.object({
    topic: z.enum([READING_TOPIC]),
    readText: z.string().min(1),
    ...questionFields,
  }),
);

/**
 * One LLM reply, restocking one (lang, level, category) cell of QuestionBank.
 * Grammar: one question per topic. Vocabulary: VOCABULARY_BATCH_SIZE questions.
 * Reading: READING_BATCH_SIZE questions, each with its own passage.
 */
export function generatedBatchSchema(category: QuestionCategory): z.ZodType<GeneratedBatch> {
  switch (category) {
    case 'grammar':
      return z.object({
        items: z
          .array(GrammarItemSchema)
          .length(TOPICS.length)
          .refine((items) => new Set(items.map((i) => i.topic)).size === TOPICS.length, {
            message: 'expected exactly one question per topic',
          }),
      });
    case 'vocabulary':
      return z.object({ items: z.array(VocabularyItemSchema).length(VOCABULARY_BATCH_SIZE) });
    case 'reading':
      return z.object({
        items: z
          .array(ReadingItemSchema)
          .length(READING_BATCH_SIZE)
          .refine((items) => new Set(items.map((i) => i.readText)).size === items.length, {
            message: 'reading questions need distinct readText passages',
          }),
      });
  }
}
