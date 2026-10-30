import type { LocalizedText } from '../schemas/artifactCommon';
import type { VocabularyBrief, VocabularyContent } from '../schemas/vocabulary';
import { COPY, dictationInstruction, examInstruction } from './lessonCopy';
import { vocabularyExamAnswers } from './vocabularyAnswers';

/**
 * Builds the playable vocabulary lesson from its brief.
 *
 * A vocabulary lesson has no content file: the brief already holds the
 * words, their groups and every exercise text. What is left is always
 * the same recipe, so this code does it:
 *
 *   step          pages                          built from
 *   introduction  one per group                  groups[].introduction
 *   flashcards    one per group                  groups[].targetIds
 *   matching      the words, 6 at most per page  matchingLabel, explanation
 *   overview      one page, every noun with a    genderExplanation (none: no step)
 *                 gender
 *   practice      one gap per word               targets[].gap
 *   listening     one choice per word            listeningOptionTargetIds
 *   exam          translation, then dictation,   examPrompt, examForms
 *                 6 words at most per page
 *
 * Every word takes part in every exercise. Durations and countdowns
 * come from VOCABULARY_TIMING. The result has the shape of
 * vocabularyContentSchema (../schemas/vocabulary.ts).
 *
 * The validator builds the lesson to check the brief's estimatedMinutes;
 * the lesson player (Milestone 3) will build it to show the lesson.
 */

/**
 * The fixed durations of the pages, in seconds. "PerWord" is multiplied
 * by the number of words on the page; "Base" is added once.
 *
 *   flashcard page of 4 words = 4 × flashcardsPerWord = 40 s
 *   gender page of 8 nouns    = genderBase + 8 × genderPerWord = 60 s
 *
 * The "Limit" values are the exam's countdowns, per word.
 */
export const VOCABULARY_TIMING = {
  introductionBase: 20,
  introductionPerWord: 3,
  flashcardsPerWord: 10,
  matchingPerWord: 10,
  /** At most 6 pairs on a matching page. */
  matchingGroupSize: 6,
  genderBase: 20,
  genderPerWord: 5,
  /** One typed gap per page. */
  gapPage: 20,
  /** One listening choice per page. */
  listeningPage: 15,
  /** At most 6 words on an exam page, all from the same group. */
  examPageSize: 6,
  translationPerWord: 15,
  translationLimitPerWord: 20,
  dictationPerWord: 20,
  dictationLimitPerWord: 30,
} as const;

/**
 * Cuts a list into the fewest pages of at most `size` items, as even as
 * possible: 7 words with size 6 give 4 + 3, never 6 + 1. `<T>` means it
 * works for a list of anything (ids, items…) and returns pages of the
 * same thing.
 */
export const chunk = <T>(list: T[], size: number): T[][] => {
  const pages = Math.ceil(list.length / size);
  return Array.from({ length: pages }, (_, i) =>
    list.slice(Math.round((i * list.length) / pages), Math.round(((i + 1) * list.length) / pages)),
  );
};

/**
 * The type of one step and one page of a lesson, taken from
 * VocabularyContent: `['steps']` is the type of the steps field (an
 * array), and `[number]` the type of one of its elements.
 */
type Step = VocabularyContent['steps'][number];
type Page = Step['pages'][number];

/**
 * The words of each matching page, as ids: every word of the lesson, in
 * group order, cut into even pages of at most 6. The validator uses it
 * too, to check that two words of one page never show the same
 * translation. `Pick<VocabularyBrief, 'groups'>` means "any object with
 * the brief's groups field": the whole brief is not needed.
 */
export function matchingPages(brief: Pick<VocabularyBrief, 'groups'>): string[][] {
  return chunk(
    brief.groups.flatMap((g) => g.targetIds),
    VOCABULARY_TIMING.matchingGroupSize,
  );
}

/**
 * Builds the playable lesson of a vocabulary brief. The brief must be
 * valid: an id that points to no word makes it crash (the `!` below
 * tells TypeScript "this is never undefined", it does not check).
 */
export function vocabularyLesson(brief: VocabularyBrief): VocabularyContent {
  const T = VOCABULARY_TIMING;
  // Every word by its id, to find one quickly: targets.get('un-livre').
  const targets = new Map(brief.targets.map((t) => [t.id, t]));
  const nouns = brief.targets.filter((t) => t.wordClass === 'noun' && t.genders.length > 0);
  // Small helpers that build one page and one step; a page has no countdown unless given one.
  const page = (
    pageId: string,
    estimatedDurationS: number,
    instructions: LocalizedText,
    items: Page['items'],
    timeLimitS: number | null = null,
  ): Page => ({ pageId, estimatedDurationS, timeLimitS, instructions, items });
  const step = (
    id: string,
    role: Step['role'],
    label: LocalizedText,
    pages: Page[],
    stage = id as Step['stage'],
  ): Step => ({ id, stage, role, label, pages });
  // The exam pages: each group cut into pages of at most 6 words, named "<group id>-1", "-2"…
  const examChunks = brief.groups.flatMap((g) =>
    chunk(g.targetIds, T.examPageSize).map((ids, n) => ({ key: `${g.id}-${n + 1}`, ids })),
  );
  // The accepted answers of a word in the exam (see vocabularyAnswers.ts).
  const answers = (id: string, prompt?: LocalizedText | Partial<LocalizedText>) => ({
    answers: vocabularyExamAnswers(targets.get(id)!, brief.lang, prompt),
  });
  // The exam question of a word: its examPrompt, or else its first translation in each language.
  const prompt = (id: string) => {
    const t = targets.get(id)!;
    return (t.examPrompt ??
      Object.fromEntries(
        Object.entries(t.translations).map(([locale, list]) => [locale, list[0]]),
      )) as LocalizedText;
  };

  const steps: Step[] = [
    step(
      'introduction',
      'introduction',
      COPY.introduction[0],
      brief.groups.map((g) =>
        page(
          `intro-${g.id}`,
          T.introductionBase + T.introductionPerWord * g.targetIds.length,
          COPY.introduction[1],
          [
            {
              type: 'vocabulary_introduction',
              itemId: `intro-${g.id}`,
              targetIds: g.targetIds,
              text: g.introduction,
            },
          ],
        ),
      ),
    ),
    step(
      'flashcards',
      'exercise',
      COPY.flashcards[0],
      brief.groups.map((g) =>
        page(`cards-${g.id}`, T.flashcardsPerWord * g.targetIds.length, COPY.flashcards[1], [
          { type: 'vocabulary_flashcards', itemId: `cards-${g.id}`, targetIds: g.targetIds },
        ]),
      ),
    ),
    step(
      'matching',
      'exercise',
      COPY.matching[0],
      matchingPages(brief).map((ids, n) =>
        page(`match-${n + 1}`, T.matchingPerWord * ids.length, COPY.matching[1], [
          {
            type: 'vocabulary_matching',
            itemId: `match-${n + 1}`,
            pairs: ids.map((id) => ({
              targetId: id,
              nativeLabel: targets.get(id)!.matchingLabel,
              answerExplanation: targets.get(id)!.explanation,
            })),
          },
        ]),
      ),
    ),
    // The gender step: nouns with a gender only. A lesson without them has no
    // gender step (`...(cond ? [step] : [])` adds the step or nothing).
    ...(nouns.length
      ? [
          step('overview', 'overview', COPY.gender[0], [
            page('overview', T.genderBase + T.genderPerWord * nouns.length, COPY.gender[1], [
              {
                type: 'vocabulary_gender_select',
                itemId: 'gender',
                targetIds: nouns.map((t) => t.id),
                rows: nouns.map((t) => ({
                  targetId: t.id,
                  answerExplanation: t.genderExplanation!,
                })),
              },
            ]),
          ]),
        ]
      : []),
    // The "practice" stage has two steps: the typed gaps here, the
    // listening choices next (that step passes 'practice' as its stage).
    step('practice', 'exercise', COPY.practice[0], [
      ...brief.targets.map((t) =>
        page(`gap-${t.id}`, T.gapPage, COPY.practice[1], [
          {
            type: 'vocabulary_typed_gap',
            itemId: `gap-${t.id}`,
            targetId: t.id,
            before: t.gap.before,
            after: t.gap.after,
            referenceTargetIds: t.gap.referenceTargetIds,
            accepted: t.gap.accepted,
            answerExplanation: t.gap.explanation,
          },
        ]),
      ),
    ]),
    step(
      'listening',
      'exercise',
      COPY.listening[0],
      brief.targets.map((t) =>
        page(`listen-${t.id}`, T.listeningPage, COPY.listening[1], [
          {
            type: 'vocabulary_listening_choice',
            itemId: `listen-${t.id}`,
            targetId: t.id,
            optionTargetIds: t.listeningOptionTargetIds,
            answerExplanation: t.explanation,
          },
        ]),
      ),
      'practice',
    ),
    // The exam: the translation pages, then the dictation pages, both with a countdown.
    step('exam', 'exam', COPY.exam[0], [
      ...examChunks.map(({ key, ids }) =>
        page(
          `exam-${key}`,
          T.translationPerWord * ids.length,
          examInstruction(brief.lang),
          ids.map((id) => ({
            type: 'vocabulary_translation_exam' as const,
            itemId: `exam-${id}`,
            targetId: id,
            prompt: prompt(id),
            accepted: answers(id, prompt(id)),
            answerExplanation: targets.get(id)!.explanation,
          })),
          T.translationLimitPerWord * ids.length,
        ),
      ),
      ...examChunks.map(({ key, ids }) =>
        page(
          `dictation-${key}`,
          T.dictationPerWord * ids.length,
          dictationInstruction(brief.lang),
          ids.map((id) => ({
            type: 'vocabulary_listening_dictation' as const,
            itemId: `dictation-${id}`,
            targetId: id,
            accepted: answers(id),
            answerExplanation: targets.get(id)!.explanation,
          })),
          T.dictationLimitPerWord * ids.length,
        ),
      ),
    ]),
  ];

  // The lesson: the brief's envelope, then the steps. `as VocabularyContent`
  // tells TypeScript to trust that the result has the right shape.
  return {
    schemaVersion: brief.schemaVersion,
    id: brief.id,
    lang: brief.lang,
    level: brief.level,
    locales: brief.locales,
    title: brief.title,
    objective: brief.objective,
    estimatedMinutes: vocabularyMinutes(steps),
    kind: 'vocabulary',
    theme: brief.theme,
    provenance: { ...brief.provenance, inputHashes: { ...brief.provenance.inputHashes } },
    steps,
  } as VocabularyContent;
}

/**
 * The length of a lesson in minutes: every page's duration added up,
 * rounded to the nearest minute, at least 1. The brief's
 * estimatedMinutes must equal this (checked by the validator).
 */
export function vocabularyMinutes(steps: { pages: { estimatedDurationS: number }[] }[]): number {
  return Math.max(
    1,
    Math.round(
      steps.flatMap((s) => s.pages).reduce((sum, p) => sum + p.estimatedDurationS, 0) / 60,
    ),
  );
}
