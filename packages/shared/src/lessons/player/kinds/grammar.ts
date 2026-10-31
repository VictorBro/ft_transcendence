import type { GrammarBrief, GrammarContent, GrammarItem } from '../../schemas/grammar';
import { PLAYER_COPY } from '../copy';
import { inMotherTongue, playerPage, wordOrder } from '../plan';
import { answers, type KindModule, NO_UNITS } from './kind';
import { contentFile } from './contentFile';

/**
 * Grammar lessons in the player: each block's explanation, then its
 * exercises, then the exam. The feedback placeholder of the lesson file
 * becomes the discussion page.
 */
export const grammar: KindModule<GrammarBrief, GrammarContent, GrammarItem> = {
  content: (brief, content) => contentFile(brief, content),

  units: (_brief, _content, motherTongue) => (item, id) => {
    const base = { itemId: item.itemId, itemType: item.type };
    switch (item.type) {
      case 'grammar_person_matching': {
        // One unit per box on the right (the answer); its options are the persons on the left.
        // A form shared by several persons (je parle, il parle) is right for each of them.
        const native = item.mode === 'translation';
        const options = item.rows.map((r) => ({
          id: r.person,
          text: native ? inMotherTongue(r.native, motherTongue) : (r.pronoun ?? ''),
          lang: native ? ('native' as const) : ('learning' as const),
        }));
        return item.rows.map((r, n) => ({
          ...base,
          kind: 'choice',
          id: id(`/${r.person}`),
          prompt: { learning: r.answer },
          options,
          correct: item.rows.filter((x) => x.answer === r.answer).map((x) => x.person),
          explanation: r.answerExplanation,
          answer: options[n].text,
          answerLang: options[n].lang,
        }));
      }
      case 'grammar_pronoun_form_match': {
        const options = item.tokens.map((t) => ({
          id: t.tokenId,
          text: t.text,
          lang: 'learning' as const,
        }));
        return item.rows.map((r) => ({
          ...base,
          kind: 'choice',
          id: id(`/${r.rowId}`),
          prompt: { learning: r.pronoun },
          options,
          correct: item.tokens.filter((t) => r.validForms.includes(t.text)).map((t) => t.tokenId),
          explanation: r.answerExplanation,
          answer: r.validForms[0],
          answerLang: 'learning',
        }));
      }
      case 'grammar_pronoun_form_typing':
        return item.rows.map((r) => ({
          ...base,
          kind: 'text',
          id: id(`/${r.rowId}`),
          prompt: { learning: r.pronoun },
          accepted: r.accepted,
          explanation: r.answerExplanation,
          answer: r.accepted.answers[0],
          answerLang: 'learning',
        }));
      case 'grammar_gap_choice':
        return [
          {
            ...base,
            kind: 'choice',
            id: id(),
            prompt: { before: item.before, after: item.after },
            options: item.choices.map((c) => ({ id: c.choiceId, text: c.text, lang: 'learning' })),
            correct: [item.answerChoiceId],
            explanation: item.answerExplanation,
            answer: item.choices.find((c) => c.choiceId === item.answerChoiceId)?.text ?? '',
            answerLang: 'learning',
          },
        ];
      case 'grammar_gap_typing':
        return [
          {
            ...base,
            kind: 'text',
            id: id(),
            prompt: { before: item.before, after: item.after },
            accepted: item.accepted,
            explanation: item.answerExplanation,
            answer: item.accepted.answers[0],
            answerLang: 'learning',
          },
        ];
      case 'grammar_word_order': {
        const { tokens, acceptedOrders, answer } = wordOrder(item);
        return [
          {
            ...base,
            kind: 'order',
            id: id(),
            prompt: {},
            tokens,
            acceptedOrders,
            explanation: item.answerExplanation,
            answer,
            answerLang: 'learning',
          },
        ];
      }
      case 'grammar_error_spotter': {
        const tokens = item.tokens.map((t) => ({
          id: t.tokenId,
          text: t.text,
          lang: 'learning' as const,
        }));
        // The answer is the sentence with the wrong word corrected.
        const sentence = tokens
          .map((t) => (t.id === item.faultyTokenId ? item.correction.accepted.answers[0] : t.text))
          .join(' ');
        return [
          {
            ...base,
            kind: 'spot',
            id: id(),
            prompt: { learning: tokens.map((t) => t.text).join(' ') },
            tokens,
            faultyTokenId: item.faultyTokenId,
            correction: item.correction,
            explanation: item.answerExplanation,
            answer: sentence,
            answerLang: 'learning',
          },
        ];
      }
      case 'grammar_explanation':
      case 'production_feedback_placeholder':
        return NO_UNITS;
    }
  },

  // The feedback placeholder's page becomes the discussion page, with its planned duration.
  arrange: (pages) => {
    const [label, instructions] = PLAYER_COPY.discussion;
    return pages.map((page) =>
      page.items.length > 0 &&
      page.items.every((it) => it.type === 'production_feedback_placeholder')
        ? playerPage(
            'discussion',
            page.pageId,
            page.stepId,
            label,
            instructions,
            page.estimatedDurationS,
          )
        : page,
    );
  },

  traits: {
    grammar_explanation: answers(false),
    production_feedback_placeholder: answers(false),
    grammar_person_matching: answers(true),
    grammar_pronoun_form_match: answers(false),
    grammar_pronoun_form_typing: answers(true),
    grammar_gap_choice: answers(true),
    grammar_gap_typing: answers(true),
    grammar_word_order: answers(true),
    grammar_error_spotter: answers(true),
  },

  // One section per teaching block (its explanation, then its exercises), named by its first step.
  section: (page) => ({ key: page.blockId ?? page.stepId, title: page.stepLabel }),
  pointTitle: (page) => {
    const item = page.items[0];
    return item?.type === 'grammar_explanation' ? item.heading : page.stepLabel;
  },
  start: (brief) => ({
    newVerbs: brief.newVerbs.map((v) => ({
      infinitive: v.infinitive,
      translation: v.translations,
    })),
  }),
  examPart: () => undefined,
};
