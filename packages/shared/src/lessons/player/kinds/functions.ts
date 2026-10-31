import { functionsTerms } from '../../domain/functionsLesson';
import type { FunctionsBrief, FunctionsContent, FunctionsItem } from '../../schemas/functions';
import { genderOptions, inMotherTongue, wordOrder } from '../plan';
import { answers, type ExamPart, type KindModule, known, NO_UNITS } from './kind';
import { contentFile } from './contentFile';

/**
 * Functions lessons in the player: the flashcards and the dialogue, the
 * exercises, then the exam in up to three parts (the words, the replies,
 * the exam dialogue), each shown on its own in the results.
 */
export const functions: KindModule<FunctionsBrief, FunctionsContent, FunctionsItem> = {
  content: (brief, content) => contentFile(brief, content),

  units: (brief, content, motherTongue) => {
    const terms = functionsTerms(brief);
    const term = (id: string) => known(terms.get(id), `Expression or word ${id}`);
    const termText = (id: string) => term(id).display;
    const termNative = (id: string) =>
      known(term(id).translations[motherTongue]?.[0], `The ${motherTongue} translation of ${id}`);
    const roleLabel = (id: string) =>
      known(
        brief.roles.find((r) => r.id === id),
        `Role ${id}`,
      ).label;
    // A gap takes the expression itself, without the " …" of a sentence start.
    const expressionText = (id: string) =>
      known(
        brief.expressions.find((e) => e.id === id),
        `Expression ${id}`,
      ).text;
    const line = (context: { roleId: string; text: string }) =>
      `${roleLabel(context.roleId)}: ${context.text}`;

    return (item, id) => {
      const base = { itemId: item.itemId, itemType: item.type };
      switch (item.type) {
        case 'function_gender_select': {
          // As in vocabulary: one choice per noun; the item lists nouns only.
          const options = genderOptions(content.lang);
          return item.ids.flatMap((wid) => {
            const w = brief.words.find((x) => x.id === wid);
            if (!w || w.wordClass !== 'noun') return [];
            return [
              {
                ...base,
                kind: 'choice' as const,
                id: id(`/${wid}`),
                prompt: { learning: w.term },
                options,
                correct: [...w.genders],
                explanation: w.explanation,
                answer: w.genders[0] ?? 'masculine',
                answerLang: 'ui' as const,
                form: w.teachingForm,
                translation: w.translations[motherTongue]?.[0] ?? w.term,
              },
            ];
          });
        }
        case 'function_matching': {
          const options = item.pairs.map((p) => ({
            id: p.id,
            text: termNative(p.id),
            lang: 'native' as const,
          }));
          return item.pairs.map((p) => ({
            ...base,
            kind: 'choice',
            id: id(`/${p.id}`),
            prompt: { learning: termText(p.id) },
            options,
            correct: [p.id],
            explanation: p.answerExplanation,
            answer: termNative(p.id),
            answerLang: 'native',
          }));
        }
        case 'function_word_order': {
          // An exam reply keeps its distractors in the bank; role A's line is the context.
          const { tokens, acceptedOrders, answer } = wordOrder(item);
          return [
            {
              ...base,
              kind: 'order',
              id: id(),
              prompt: item.context ? { learning: line(item.context) } : {},
              tokens,
              acceptedOrders,
              distractors: item.distractorTokenIds,
              explanation: item.answerExplanation,
              answer,
              answerLang: 'learning',
            },
          ];
        }
        case 'function_translation_exam': {
          // As the vocabulary translation exam; a word taught with "des" is a plurale tantum.
          const w = brief.words.find((x) => x.id === item.wordId);
          const noun =
            w && w.wordClass === 'noun' && w.genders.length
              ? { genders: [...w.genders], pluraleTantum: /^des\s/iu.test(w.teachingForm) }
              : undefined;
          return [
            {
              ...base,
              kind: 'text',
              id: id(),
              prompt: { native: inMotherTongue(item.prompt, motherTongue) },
              accepted: item.accepted,
              explanation: item.answerExplanation,
              answer: item.accepted.answers[0],
              answerLang: 'learning',
              ...(noun ? { noun } : {}),
            },
          ];
        }
        case 'function_listening_choice':
          // Role A's line is heard, then the four replies are read.
          return [
            {
              ...base,
              kind: 'choice',
              id: id(),
              prompt: { learning: line(item.context) },
              speak: item.context.text,
              options: item.options.map((o) => ({
                id: o.optionId,
                text: o.text,
                lang: 'learning',
              })),
              correct: [item.answerOptionId],
              explanation: item.answerExplanation,
              answer: item.options.find((o) => o.optionId === item.answerOptionId)?.text ?? '',
              answerLang: 'learning',
            },
          ];
        case 'function_dialogue_gap_choice':
          return [
            {
              ...base,
              kind: 'choice',
              id: id(),
              prompt: { learning: line(item.context), before: item.before, after: item.after },
              options: item.choiceExpressionIds.map((e) => ({
                id: e,
                text: expressionText(e),
                lang: 'learning',
              })),
              correct: [item.expressionId],
              explanation: item.answerExplanation,
              answer: expressionText(item.expressionId),
              answerLang: 'learning',
            },
          ];
        case 'function_dialogue_gap_typing':
          // One unit per gap of the exam dialogue; the lines unroll on one timed page.
          return item.lines.flatMap((l) =>
            l.gap
              ? [
                  {
                    ...base,
                    kind: 'text' as const,
                    id: id(`/${l.gap.gapId}`),
                    prompt: { before: l.before, after: l.after },
                    accepted: l.gap.accepted,
                    explanation: l.gap.answerExplanation,
                    answer: l.gap.accepted.answers[0],
                    answerLang: 'learning' as const,
                  },
                ]
              : [],
          );
        case 'function_flashcards':
        case 'function_dialogue':
          return NO_UNITS;
      }
    };
  },

  arrange: (pages) => pages,

  traits: {
    function_flashcards: { reveals: (item) => item.ids, skipFeedbackWhenRight: false },
    // Every line after the first is shown with Next line.
    function_dialogue: {
      reveals: (item) => item.lines.slice(1).map((l) => l.lineId),
      skipFeedbackWhenRight: false,
    },
    function_gender_select: answers(false),
    function_matching: answers(true),
    function_word_order: answers(true),
    function_listening_choice: answers(true),
    function_dialogue_gap_choice: answers(true),
    function_translation_exam: answers(true),
    function_dialogue_gap_typing: answers(false),
  },

  // Two sections before the exam: what is presented, then the exercises; named by their steps.
  section: (page) => ({ key: page.role }),
  pointTitle: (page) => page.stepLabel,
  start: (brief) => ({ situation: brief.situation, roles: brief.roles.map((r) => r.label) }),
  examPart: (page): ExamPart | undefined => {
    const types = new Set(page.units.map((u) => u.itemType));
    if (types.size !== 1) return undefined;
    if (types.has('function_translation_exam')) return 'translation';
    if (types.has('function_dialogue_gap_typing')) return 'dialogue';
    return types.has('function_word_order') ? 'replies' : undefined;
  },
};
