import { z } from 'zod';

import { LevelSchema } from '../../schemas/item';
import { LanguageSchema } from '../../schemas/language';
import { LessonIdSchema } from '../../schemas/lesson';
import { type Locale, SUPPORTED_LOCALES } from '../../schemas/locale';

/**
 * The building blocks shared by every lesson file.
 *
 * A lesson is one or two JSON files with the same id: a brief (the plan)
 * and a content file (the playable lesson). A vocabulary lesson has only
 * the brief, which is the whole lesson. Both files start with the same
 * envelope, then the lesson's kind, then a body that depends on the kind:
 *
 * content/briefs/fr-negation-ne-pas.json      content/lessons/fr-negation-ne-pas.json
 * ┌──────────────────────────────┐            ┌──────────────────────────────┐
 * │ ENVELOPE (9 fields)          │            │ ENVELOPE (9 fields)          │
 * │ schemaVersion, id, lang,     │            │ schemaVersion, id, lang,     │
 * │ level, locales, title,       │  ← same →  │ level, locales, title,       │
 * │ objective, estimatedMinutes, │            │ objective, estimatedMinutes, │
 * │ provenance                   │            │ provenance                   │
 * ├──────────────────────────────┤            ├──────────────────────────────┤
 * │ kind: "grammar"              │            │ kind: "grammar"              │
 * │ topic: "negation"            │            │ topic: "negation"            │
 * ├──────────────────────────────┤            ├──────────────────────────────┤
 * │ BRIEF BODY                   │            │ CONTENT BODY                 │
 * │ the plan: rules, blocks,     │            │ the playable lesson: steps,  │
 * │ how many exercises…          │            │ pages, exercises, answers…   │
 * └──────────────────────────────┘            └──────────────────────────────┘
 *
 * This file holds the envelope (envelopeShape) and the smaller rules the
 * four kinds build their bodies from: texts in en/fr/de, translations,
 * ids, durations, accepted answers, the scoring policy. Each kind's
 * schema (vocabulary.ts, grammar.ts, functions.ts, reading.ts) imports
 * them.
 *
 * These schemas check the shape of a file only: types, lengths, required
 * fields. Rules that compare fields, or compare the file with its outline
 * entry, are in ../validation/.
 */

/**
 * The format version written in every lesson file ("schemaVersion": 2).
 * A file with any other number is rejected. Version 2 has its help texts
 * in English, French and German, and its translations into every native
 * language. Raise this number when the format changes.
 */
export const ARTIFACT_SCHEMA_VERSION = 2;

/**
 * Maximum length, in characters, of each kind of text in a lesson file:
 * a label (a short heading), a short help text, a long explanation, and a
 * text in the language being learned. The lesson title and summary have
 * stricter limits of their own (LESSON_TITLE_MAX, LESSON_SUMMARY_MAX).
 */
export const TEXT_LIMITS = { label: 120, short: 300, long: 1200, learning: 300 } as const;

/**
 * A text rule: spaces at both ends are removed, then the text must be
 * 1 to `max` characters long. The removal changes the value, so store
 * what the schema returns, not the raw file.
 */
const boundedText = (max: number) => z.string().trim().min(1).max(max);

/**
 * One text in the learner's own language, such as a translation.
 * One language only: a text in en, fr and de is localizedText below.
 */
export const SupportTextSchema = boundedText(TEXT_LIMITS.short);

/**
 * One text in the language being learned: a word, an example sentence,
 * a choice, an answer. The lesson title is one too.
 */
export const LearningTextSchema = boundedText(TEXT_LIMITS.learning);

/**
 * A help text written in all three interface languages: { en, fr, de }.
 * The learner sees the one of their interface. `max` is the length limit
 * for each language; three ready-made sizes follow.
 */
export const localizedText = (max: number = TEXT_LIMITS.short) =>
  z.strictObject({ en: boundedText(max), fr: boundedText(max), de: boundedText(max) });
/** Most help texts: an objective, an instruction. */
export const LocalizedTextSchema = localizedText();
/** A short heading. */
export const LocalizedLabelSchema = localizedText(TEXT_LIMITS.label);
/** A full explanation. */
export const LocalizedLongTextSchema = localizedText(TEXT_LIMITS.long);
/** The type of all three: TypeScript does not see length limits. */
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/**
 * The translations of one word or phrase into one language, 1 to 6.
 * The first is the one shown to the learner; the others are also
 * accepted as answers.
 */
export const TranslationVariantsSchema = z.array(SupportTextSchema).min(1).max(6);

/**
 * The languages a course translates into: every interface language
 * except the one being learned. A French course translates into
 * English and German.
 */
export function nativeLocales(lang: string): Locale[] {
  return SUPPORTED_LOCALES.filter((l) => l !== lang);
}

/**
 * An object with one `value` per language the course translates into:
 * { en, de } for a French course. Its keys depend on the course, so it is
 * built when the code runs. The cast only names the keys for TypeScript;
 * the schema itself accepts exactly the course's languages.
 */
function nativeMap<T extends z.ZodType>(lang: string, value: T) {
  return z.strictObject(
    Object.fromEntries(nativeLocales(lang).map((l) => [l, value])) as Record<Locale, T>,
  );
}

/** Every translation of a word, per language the course translates into. */
export const nativeTranslationsSchema = (lang: string) =>
  nativeMap(lang, TranslationVariantsSchema);
/** Written by hand: which languages are present depends on the course. */
export type NativeTranslations = Partial<Record<Locale, string[]>>;

/** One sentence, per language the course translates into. */
export const nativeTextSchema = (lang: string) => nativeMap(lang, SupportTextSchema);
/** Written by hand: which languages are present depends on the course. */
export type NativeText = Partial<Record<Locale, string>>;

/**
 * The id of a part inside one lesson file: a word, a rule, a block, a
 * step, a page, an exercise, a choice. Other parts refer to it by this
 * id. Lowercase letters, digits and hyphens, starting with a letter or
 * digit, 48 characters at most. The validators check that ids are unique
 * and that every reference points to one that exists.
 */
export const NestedIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'expected a lowercase id of letters, digits and hyphens');

/**
 * How long a page should take, in whole seconds (5 s to 1 h). Not shown
 * to the learner: the pages' estimates add up to the lesson's
 * estimatedMinutes.
 */
export const DurationSecondsSchema = z.number().int().min(5).max(3600);

/**
 * The countdown of a page, in whole seconds (5 s to 15 min): the page
 * ends when it reaches zero. Only exam pages have one; the others set
 * it to null.
 */
export const TimeLimitSecondsSchema = z.number().int().min(5).max(900);

/**
 * The right answers to a question the learner types, 1 to 8, in the
 * language being learned. They are compared to what the learner typed;
 * how a near miss scores (a missing accent, a capital) is decided
 * when the answer is graded, not here.
 */
export const AcceptedAnswersSchema = z.strictObject({
  answers: z.array(LearningTextSchema).min(1).max(8),
});
export type AcceptedAnswers = z.infer<typeof AcceptedAnswersSchema>;

/**
 * Where a lesson file comes from: the tool and model that wrote it, the
 * prompt version, and when (an ISO date in UTC). inputHashes are SHA-256
 * fingerprints of what it was written from: the outline entry, and for a
 * content file its brief. When one no longer matches, the file is out of
 * date. validateLesson does not compare them; the authoring kit (#83)
 * computes them.
 */
export const ProvenanceSchema = z.strictObject({
  generator: boundedText(80),
  model: boundedText(80),
  promptVersion: boundedText(40),
  generatedAt: z.iso.datetime(),
  /** brief: only in a content file, which is written from its brief. */
  inputHashes: z.strictObject({
    outline: z.string().min(16),
    brief: z.string().min(16).optional(),
  }),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * The fields every lesson file starts with, brief or content, whatever the
 * kind. A plain object, not a schema: each kind spreads it into its own
 * (`...envelopeShape`) and adds its `kind` and `topic` or `theme`. The
 * validators check that id, lang and level match the outline. The seed
 * stores `title` and `objective[lang]`, which validateLesson limits to
 * 80 and 200 characters.
 */
export const envelopeShape = {
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  id: LessonIdSchema,
  lang: LanguageSchema,
  level: LevelSchema,
  /** The supported locale contract; no single nativeLanguage field exists. */
  locales: z.tuple([z.literal('en'), z.literal('fr'), z.literal('de')]),
  title: LearningTextSchema,
  objective: LocalizedTextSchema,
  estimatedMinutes: z.number().int().min(1).max(120),
  provenance: ProvenanceSchema,
};

/**
 * How a lesson is scored, the same for every lesson: practice counts for
 * 35 % and the exam for 65 %, and an answer wrong only by an accent or a
 * capital earns half a point. Written in every brief so a reviewer sees
 * it; nothing here computes a score (that is the lesson player's job).
 */
export const ScoringPolicySchema = z.strictObject({
  practiceWeight: z.literal(35),
  examWeight: z.literal(65),
  orthographyCredit: z.literal(0.5),
});
