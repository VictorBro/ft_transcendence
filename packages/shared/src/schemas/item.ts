import { z } from 'zod';

import { LocaleSchema } from './locale';

/**
 * Placement questions, as authored in `content/items/*.json` and seeded into
 * `ItemBank`. One schema validates the files in CI and parses them at seed time,
 * so a malformed item is caught by whoever wrote it rather than by whoever runs
 * the migration. Authoring guide: docs/ITEM_BANK.md.
 */

export const SKILLS = ['grammar', 'vocabulary', 'reading'] as const;
export const SkillSchema = z.enum(SKILLS);
export type Skill = z.infer<typeof SkillSchema>;

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const CefrLevelSchema = z.enum(CEFR_LEVELS);
export type CefrLevel = z.infer<typeof CefrLevelSchema>;

/**
 * A closed list on purpose: it keys both the items and the lesson topics, so an
 * item and the lesson that teaches it stay describable in the same words.
 */
export const GRAMMAR_TOPICS = [
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
export const GrammarTopicSchema = z.enum(GRAMMAR_TOPICS);
export type GrammarTopic = z.infer<typeof GrammarTopicSchema>;

export const OPTIONS_PER_ITEM = 4;

/** `<language>-<3-letter skill>-<4 digits>`, for example `en-gram-0001`. */
export const ITEM_ID_PATTERN = /^[a-z]{2}-(gram|voca|read)-\d{4}$/;

export const ItemSchema = z
  .object({
    id: z.string().regex(ITEM_ID_PATTERN, 'expected <lang>-<gram|voca|read>-<4 digits>'),
    cefr: CefrLevelSchema,
    topic: GrammarTopicSchema,
    /** Reading items only: the text the question is about. */
    passage: z.string().min(1).optional(),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
    answer: z.string().min(1),
  })
  .strict()
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
    language: LocaleSchema,
    skill: SkillSchema,
    items: z.array(ItemSchema).min(1),
  })
  .strict()
  .refine((file) => new Set(file.items.map((i) => i.id)).size === file.items.length, {
    message: 'ids must be unique within the file',
    path: ['items'],
  })
  // A reading question without its passage is unanswerable; a passage on a
  // grammar item is dead weight nobody will render.
  .refine(
    (file) => file.items.every((i) => (file.skill === 'reading') === (i.passage !== undefined)),
    {
      message: 'reading items need a passage, other skills must not have one',
      path: ['items'],
    },
  );

export type ItemFile = z.infer<typeof ItemFileSchema>;

/** The three-letter segment an id must carry for a given skill. */
export const SKILL_ID_SEGMENT: Record<Skill, string> = {
  grammar: 'gram',
  vocabulary: 'voca',
  reading: 'read',
};

/** `content/items/<language>-<skill>.json`, the name the seed script globs. */
export function itemFileName(language: string, skill: Skill): string {
  return `${language}-${skill}.json`;
}
