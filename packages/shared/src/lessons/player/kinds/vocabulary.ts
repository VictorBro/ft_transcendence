import { vocabularyLesson } from '../../domain/vocabularyLesson';
import type { VocabularyBrief, VocabularyContent, VocabularyItem } from '../../schemas/vocabulary';
import { PLAYER_COPY } from '../copy';
import { genderOptions, inMotherTongue, type PlanPage } from '../plan';
import { answers, type KindModule, NO_UNITS } from './kind';

/**
 * Vocabulary lessons in the player.
 *
 * The lesson is built from the brief (../../domain/vocabularyLesson.ts),
 * then two things change for the player:
 * - **no listening**: the listening choices and the dictation are left
 *   out, so the exam is the translation only;
 * - each group's introduction is followed by that group's flashcards:
 *   intro 1, cards 1, intro 2, cards 2…
 */

const LISTENING = new Set<VocabularyItem['type']>([
  'vocabulary_listening_choice',
  'vocabulary_listening_dictation',
]);

/** The lesson without its listening items, and without the pages and steps they leave empty. */
function withoutListening(content: VocabularyContent): VocabularyContent {
  const steps = content.steps
    .map((step) => ({
      ...step,
      pages: step.pages
        .map((page) => ({ ...page, items: page.items.filter((it) => !LISTENING.has(it.type)) }))
        .filter((page) => page.items.length > 0),
    }))
    .filter((step) => step.pages.length > 0);
  return { ...content, steps };
}

const isIntro = (p: PlanPage) => p.items.some((it) => it.type === 'vocabulary_introduction');
const isCards = (p: PlanPage) => p.items.some((it) => it.type === 'vocabulary_flashcards');

/** Reorders the pages: intro 1, cards 1, intro 2, cards 2… (paired in group order). */
function interleave(pages: PlanPage[]): PlanPage[] {
  const intros = pages.filter(isIntro);
  const cards = pages.filter(isCards);
  const start = pages.findIndex((p) => isIntro(p) || isCards(p));
  if (start < 0) return pages;
  const merged = Array.from({ length: Math.max(intros.length, cards.length) }, (_, n) => [
    intros[n],
    cards[n],
  ])
    .flat()
    .filter((p): p is PlanPage => !!p);
  return [...pages.slice(0, start), ...merged, ...pages.slice(start + merged.length)];
}

export const vocabulary: KindModule<VocabularyBrief, VocabularyContent, VocabularyItem> = {
  content: (brief) => withoutListening(vocabularyLesson(brief)),

  units: (brief, content, motherTongue) => {
    const targets = new Map(brief.targets.map((t) => [t.id, t]));
    const translation = (id: string) => targets.get(id)?.translations[motherTongue]?.[0] ?? id;
    const form = (id: string) => targets.get(id)?.teachingForm ?? id;
    return (item, id) => {
      switch (item.type) {
        case 'vocabulary_matching': {
          // The mother tongue on one side, the words on the other: one unit per word.
          const options = item.pairs.map((p) => ({
            id: p.targetId,
            text: inMotherTongue(p.nativeLabel, motherTongue) || translation(p.targetId),
            lang: 'native' as const,
          }));
          return item.pairs.map((p, n) => ({
            kind: 'choice',
            id: id(`/${p.targetId}`),
            itemId: item.itemId,
            itemType: item.type,
            prompt: { learning: form(p.targetId) },
            options,
            correct: [p.targetId],
            explanation: p.answerExplanation,
            answer: options[n].text,
            answerLang: 'native',
          }));
        }
        case 'vocabulary_gender_select': {
          const options = genderOptions(content.lang);
          return item.rows.map((r) => {
            const t = targets.get(r.targetId);
            return {
              kind: 'choice',
              id: id(`/${r.targetId}`),
              itemId: item.itemId,
              itemType: item.type,
              prompt: { learning: t?.term ?? r.targetId },
              options,
              correct: [...(t?.genders ?? [])],
              explanation: r.answerExplanation,
              answer: t?.genders[0] ?? 'masculine',
              answerLang: 'ui',
              form: form(r.targetId),
              translation: translation(r.targetId),
            };
          });
        }
        case 'vocabulary_typed_gap':
          return [
            {
              kind: 'text',
              id: id(),
              itemId: item.itemId,
              itemType: item.type,
              prompt: {
                before: item.before,
                after: item.after,
                native: translation(item.targetId),
              },
              accepted: item.accepted,
              explanation: item.answerExplanation,
              answer: item.accepted.answers[0],
              answerLang: 'learning',
            },
          ];
        case 'vocabulary_translation_exam': {
          const t = targets.get(item.targetId);
          const noun =
            t && t.wordClass === 'noun' && !t.articleException && t.genders.length
              ? { genders: [...t.genders], pluraleTantum: t.number === 'plural' }
              : undefined;
          return [
            {
              kind: 'text',
              id: id(),
              itemId: item.itemId,
              itemType: item.type,
              prompt: { native: inMotherTongue(item.prompt, motherTongue) },
              accepted: item.accepted,
              explanation: item.answerExplanation,
              answer: item.accepted.answers[0],
              answerLang: 'learning',
              ...(noun ? { noun } : {}),
            },
          ];
        }
        // Left out of the plan (see withoutListening); presentation items have no units.
        case 'vocabulary_listening_choice':
        case 'vocabulary_listening_dictation':
        case 'vocabulary_introduction':
        case 'vocabulary_flashcards':
          return NO_UNITS;
      }
    };
  },

  arrange: interleave,

  traits: {
    vocabulary_introduction: answers(false),
    vocabulary_flashcards: { reveals: (item) => item.targetIds, skipFeedbackWhenRight: false },
    vocabulary_matching: answers(true),
    vocabulary_gender_select: answers(false),
    vocabulary_typed_gap: answers(true),
    vocabulary_listening_choice: answers(true),
    vocabulary_translation_exam: answers(true),
    vocabulary_listening_dictation: answers(true),
  },

  // One section per group (its introduction and flashcards), then the exercises.
  section: (page, plan) => {
    const brief = plan.brief as VocabularyBrief;
    const item = page.items[0];
    const first = item && 'targetIds' in item ? item.targetIds[0] : undefined;
    const group = brief.groups.find((g) => first !== undefined && g.targetIds.includes(first));
    return page.role === 'presentation' && group
      ? { key: group.id, title: group.label }
      : { key: 'exercises', title: PLAYER_COPY.exercises };
  },
  pointTitle: (page) => page.stepLabel,
  start: (brief) => ({ words: brief.targets.length }),
  examPart: () => undefined,
};
