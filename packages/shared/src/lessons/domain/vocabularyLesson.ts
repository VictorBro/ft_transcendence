import type { LocalizedText } from '../schemas/artifactCommon';
import type { VocabularyBrief, VocabularyContent } from '../schemas/vocabulary';
import { COPY } from './lessonCopy';
import { vocabularyExamAnswers } from './vocabularyAnswers';

/**
 * Vocabulary lessons have no content file (P2-04): the brief holds the words, their groups with
 * introductions and every exercise text, and this module derives the same six stages for every
 * lesson. Every word takes part in every exercise; page durations and exam limits follow fixed rules.
 */

/** Page estimates and exam limits in seconds (SPEC section 6, "Derived lesson"). */
export const VOCABULARY_TIMING = {
  introductionBase: 20,
  introductionPerWord: 3,
  flashcardsPerWord: 10,
  matchingPerWord: 10,
  /** Matching pages hold at most this many pairs (balanced, in group order). */
  matchingGroupSize: 6,
  genderBase: 20,
  genderPerWord: 5,
  gapPage: 20,
  listeningPage: 15,
  /** Exam pages hold at most this many words of one group. */
  examPageSize: 6,
  translationPerWord: 15,
  translationLimitPerWord: 20,
  dictationPerWord: 20,
  dictationLimitPerWord: 30,
} as const;

/** Splits a list into the fewest pages of at most `size` items, balanced in length (7 → 4 + 3, never 6 + 1). */
export const chunk = <T>(list: T[], size: number): T[][] => {
  const pages = Math.ceil(list.length / size);
  return Array.from({ length: pages }, (_, i) =>
    list.slice(Math.round((i * list.length) / pages), Math.round(((i + 1) * list.length) / pages)),
  );
};

type Step = VocabularyContent['steps'][number];
type Page = Step['pages'][number];

/** Matching pages: the words in group order, cut into balanced pages of at most six pairs. */
export function matchingPages(brief: Pick<VocabularyBrief, 'groups'>): string[][] {
  return chunk(
    brief.groups.flatMap((g) => g.targetIds),
    VOCABULARY_TIMING.matchingGroupSize,
  );
}

/** Builds the renderable lesson of a (valid) vocabulary brief. */
export function vocabularyLesson(brief: VocabularyBrief): VocabularyContent {
  const T = VOCABULARY_TIMING;
  const targets = new Map(brief.targets.map((t) => [t.id, t]));
  const nouns = brief.targets.filter((t) => t.wordClass === 'noun');
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
  const examChunks = brief.groups.flatMap((g) =>
    chunk(g.targetIds, T.examPageSize).map((ids, n) => ({ key: `${g.id}-${n + 1}`, ids })),
  );
  const answers = (id: string, prompt?: LocalizedText | Partial<LocalizedText>) => ({
    answers: vocabularyExamAnswers(targets.get(id)!, brief.lang, prompt),
  });
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
    // Only nouns: words without a gender are left out, and a lesson without nouns has no gender step (P06-00), as in function lessons.
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
    // Stage 5 has two steps, so typed gaps and listening are reviewed separately in the results menu (P2-04 review).
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
    step('exam', 'exam', COPY.exam[0], [
      ...examChunks.map(({ key, ids }) =>
        page(
          `exam-${key}`,
          T.translationPerWord * ids.length,
          COPY.exam[1],
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
          COPY.dictation[1],
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

/** Lesson length: the summed page estimates rounded to minutes (at least 1). */
export function vocabularyMinutes(steps: { pages: { estimatedDurationS: number }[] }[]): number {
  return Math.max(
    1,
    Math.round(
      steps.flatMap((s) => s.pages).reduce((sum, p) => sum + p.estimatedDurationS, 0) / 60,
    ),
  );
}
