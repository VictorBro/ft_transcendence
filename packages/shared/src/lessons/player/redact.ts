import { functionsTerms } from '../domain/functionsLesson';
import type { FunctionsBrief } from '../schemas/functions';
import type { ReadingBrief, ReadingContent } from '../schemas/reading';
import type { VocabularyBrief } from '../schemas/vocabulary';
import { articleHint } from './articleHint';
import {
  inMotherTongue,
  isScored,
  type Item,
  type LessonPlan,
  type PlanPage,
  type PlanUnit,
} from './plan';
import type { ItemView, PageView, Ref, UnitView } from './view';

/**
 * The page views: what the browser gets of the page at the cursor, built
 * from the plan, which holds every key. One case per item type, and a
 * `never` case, so a new item type does not compile until it says what
 * its page shows.
 *
 * - A presentation item (an introduction, flashcards, an explanation,
 *   the model dialogue, key words, a document) is sent whole: it teaches.
 * - An exercise is sent as its units, with no key: no accepted answer,
 *   right option or order, faulty token, explanation, nor which tokens
 *   are distractors. A gender row's teaching form and translation come
 *   with the feedback (feedback.ts).
 * - Reading: the main document goes with its practice pages, the exam
 *   document only with the exam page, and the genre never.
 * - Every unit, option, token and card is named by a Ref, never by its
 *   id. `ref` is passed in: the API computes it as an HMAC with the
 *   attempt's secret. A shuffled list is sorted by its refs, so a new
 *   attempt gets a new order and the order says nothing about the
 *   answer. Lists whose order means something keep it: true or false,
 *   gender options, the persons of a person matching, the words of an
 *   error-spotter sentence.
 */

/** Turns an internal path into the ref the browser sees. */
export type RefOf = (path: string) => Ref;

/**
 * The internal paths that refs are made from. A unit's path is its id;
 * an option, token or card is named inside its item, so the same option
 * on every row of a matching board has one ref.
 */
export const paths = {
  unit: (unit: Pick<PlanUnit, 'id'>) => unit.id,
  item: (page: Pick<PlanPage, 'pageId'>, itemId: string) => `${page.pageId}/${itemId}`,
  option: (page: Pick<PlanPage, 'pageId'>, itemId: string, id: string) =>
    `${page.pageId}/${itemId}#o:${id}`,
  token: (page: Pick<PlanPage, 'pageId'>, itemId: string, id: string) =>
    `${page.pageId}/${itemId}#t:${id}`,
  card: (page: Pick<PlanPage, 'pageId'>, itemId: string, id: string) =>
    `${page.pageId}/${itemId}#c:${id}`,
};

/** Sorts a list by its elements' refs: the shuffle of one attempt. */
const byRef = <T extends { ref: Ref }>(list: T[]) =>
  [...list].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

/** Shuffled or kept in order. */
type Order = 'shuffle' | 'keep';

/** The view of the page at `index`. */
export function pageView(plan: LessonPlan, index: number, ref: RefOf): PageView {
  const page = plan.pages[index];
  if (!page) throw new Error(`Lesson ${plan.lessonId} has no page ${index}`);
  return {
    index,
    role: page.role,
    scored: isScored(page),
    instructions: page.instructions,
    items: page.items.map((item) => itemView(plan, page, item, ref)),
  };
}

function itemView(plan: LessonPlan, page: PlanPage, item: Item, ref: RefOf): ItemView {
  const tongue = plan.motherTongue;
  const unitsOf = page.units.filter((u) => u.itemId === item.itemId);
  // The units of the item, all of one kind, with their options or tokens shuffled or kept.
  const units = <K extends UnitView['kind']>(
    kind: K,
    options: Order = 'shuffle',
    rows: Order = 'keep',
  ) => {
    const list = unitsOf.map((u) => {
      const view = unitView(plan, page, u, ref, options);
      if (view.kind !== kind) throw new Error(`${item.type} has a ${view.kind} unit`);
      return view as Extract<UnitView, { kind: K }>;
    });
    return rows === 'shuffle' ? byRef(list) : list;
  };
  const card = (id: string) => ref(paths.card(page, item.itemId, id));

  switch (item.type) {
    /* vocabulary */
    case 'vocabulary_introduction': {
      const targets = new Map((plan.brief as VocabularyBrief).targets.map((t) => [t.id, t]));
      return {
        type: item.type,
        text: item.text,
        words: item.targetIds.map((id) => ({
          text: targets.get(id)?.teachingForm ?? '',
          translations: targets.get(id)?.translations[tongue] ?? [],
        })),
      };
    }
    case 'vocabulary_flashcards': {
      const targets = new Map((plan.brief as VocabularyBrief).targets.map((t) => [t.id, t]));
      return {
        type: item.type,
        cards: item.targetIds.flatMap((id) => {
          const t = targets.get(id);
          return t
            ? [
                {
                  ref: card(id),
                  text: t.teachingForm,
                  translations: t.translations[tongue] ?? [],
                  pronunciation: t.pronunciation,
                  example: {
                    text: t.context.sentence,
                    translation: inMotherTongue(t.context.translation, tongue),
                  },
                },
              ]
            : [];
        }),
      };
    }
    case 'vocabulary_matching':
      return { type: item.type, units: units('choice', 'shuffle', 'shuffle') };
    case 'vocabulary_gender_select':
      return { type: item.type, units: units('choice', 'keep') };
    case 'vocabulary_typed_gap': {
      const targets = new Map((plan.brief as VocabularyBrief).targets.map((t) => [t.id, t]));
      return {
        type: item.type,
        references: byRef(
          item.referenceTargetIds.map((id) => ({
            ref: card(id),
            text: targets.get(id)?.term ?? '',
            genders: [...(targets.get(id)?.genders ?? [])],
          })),
        ),
        units: units('text'),
      };
    }
    case 'vocabulary_translation_exam':
      return { type: item.type, units: units('text') };
    // The player leaves the vocabulary listening out (kinds/vocabulary.ts).
    case 'vocabulary_listening_choice':
    case 'vocabulary_listening_dictation':
      throw new Error(`${item.type} is not part of a plan`);

    /* grammar */
    case 'grammar_explanation':
      return {
        type: item.type,
        heading: item.heading,
        text: item.text,
        formTable: item.formTable.map((r) => ({ ...r })),
        examples: item.examples.map((e) => ({
          text: e.text,
          translation: inMotherTongue(e.translation, tongue),
        })),
      };
    case 'production_feedback_placeholder':
      throw new Error('The feedback placeholder is the discussion page in a plan');
    // The persons keep their order; the boxes on the other side are shuffled.
    case 'grammar_person_matching':
      return { type: item.type, mode: item.mode, units: units('choice', 'keep', 'shuffle') };
    // A drag board: the forms are shuffled, the pronouns keep their order.
    case 'grammar_pronoun_form_match':
      return { type: item.type, units: units('choice') };
    case 'grammar_pronoun_form_typing':
      return { type: item.type, units: units('text') };
    case 'grammar_word_order':
      return { type: item.type, units: units('order') };
    case 'grammar_error_spotter':
      return { type: item.type, units: units('spot') };
    case 'grammar_gap_choice':
      return { type: item.type, hint: item.hint, units: units('choice') };
    case 'grammar_gap_typing':
      return { type: item.type, hint: item.hint, units: units('text') };

    /* functions */
    case 'function_flashcards': {
      const brief = plan.brief as FunctionsBrief;
      const terms = functionsTerms(brief);
      return {
        type: item.type,
        side: item.side,
        cards: item.ids.flatMap((id) => {
          const expression = brief.expressions.find((e) => e.id === id);
          const word = brief.words.find((w) => w.id === id);
          const term = terms.get(id);
          const example = (expression ?? word)?.example;
          if (!term || !example) return [];
          return [
            {
              ref: card(id),
              text: term.display,
              translations: term.translations[tongue] ?? [],
              ...(expression ? { explanation: expression.explanation } : {}),
              ...(word ? { genders: [...word.genders] } : {}),
              example: {
                text: example.text,
                translation: inMotherTongue(example.translation, tongue),
              },
            },
          ];
        }),
      };
    }
    case 'function_dialogue': {
      const roles = (plan.brief as FunctionsBrief).roles;
      return {
        type: item.type,
        lines: item.lines.map((l) => {
          const role = roles.find((r) => r.id === l.roleId);
          return {
            ref: card(l.lineId),
            role: role?.label ?? '',
            roleTranslation: inMotherTongue(role?.translation, tongue),
            text: l.text,
            translation: inMotherTongue(l.translation, tongue),
            note: l.note,
          };
        }),
      };
    }
    case 'function_gender_select':
      return { type: item.type, units: units('choice', 'keep') };
    case 'function_matching':
      return { type: item.type, side: item.side, units: units('choice', 'shuffle', 'shuffle') };
    case 'function_word_order':
      return { type: item.type, units: units('order') };
    case 'function_listening_choice':
    case 'function_dialogue_gap_choice':
      return { type: item.type, units: units('choice') };
    case 'function_translation_exam':
      return { type: item.type, units: units('text') };
    case 'function_dialogue_gap_typing': {
      const roles = (plan.brief as FunctionsBrief).roles;
      const gaps = new Map(unitsOf.map((u) => [u.id, u]));
      return {
        type: item.type,
        lines: item.lines.map((l) => {
          const gap = l.gap
            ? gaps.get(`${paths.item(page, item.itemId)}/${l.gap.gapId}`)
            : undefined;
          return {
            role: roles.find((r) => r.id === l.roleId)?.label ?? '',
            before: l.before,
            after: l.after,
            translation: inMotherTongue(l.translation, tongue),
            gap: gap ? ref(paths.unit(gap)) : null,
          };
        }),
        units: units('text'),
      };
    }

    /* reading */
    case 'reading_flashcards': {
      const keywords = (plan.brief as ReadingBrief).keywords;
      return {
        type: item.type,
        cards: item.keywordIds.flatMap((id) => {
          const k = keywords.find((x) => x.id === id);
          return k
            ? [{ ref: card(id), text: k.term, translations: k.translations[tongue] ?? [] }]
            : [];
        }),
      };
    }
    case 'reading_keyword_matching':
      return { type: item.type, units: units('choice', 'shuffle', 'shuffle') };
    case 'reading_document': {
      const doc = (plan.content as ReadingContent).documents.find(
        (d) => d.documentId === item.documentId,
      );
      if (!doc) throw new Error(`Lesson ${plan.lessonId} has no ${item.documentId} document`);
      return {
        type: item.type,
        view: item.view,
        skimSeconds: item.skimSeconds,
        document: {
          title: doc.title,
          meta: [...doc.meta],
          paragraphs: [...doc.paragraphs],
          highlights: doc.highlights.map((h) => h.text),
        },
      };
    }
    case 'reading_skim_choice':
      return { type: item.type, focus: item.focus, units: units('choice') };
    case 'reading_choice':
      return { type: item.type, units: units('choice') };
    case 'reading_order':
      return { type: item.type, units: units('order') };
    // True, then false.
    case 'reading_true_false':
      return { type: item.type, units: units('choice', 'keep') };

    default: {
      const unhandled: never = item;
      throw new Error(`No page view for item type ${(unhandled as Item).type}`);
    }
  }
}

/** The item types whose text units ask for an article hint. */
const TRANSLATION_EXAMS = new Set<string>([
  'vocabulary_translation_exam',
  'function_translation_exam',
]);

/** One unit without its key; `options` says whether its options and tokens are shuffled. */
function unitView(
  plan: LessonPlan,
  page: PlanPage,
  unit: PlanUnit,
  ref: RefOf,
  options: Order,
): UnitView {
  const base = { ref: ref(paths.unit(unit)), prompt: { ...unit.prompt } };
  const order = <T extends { ref: Ref }>(list: T[]) => (options === 'shuffle' ? byRef(list) : list);
  switch (unit.kind) {
    case 'text':
      return {
        ...base,
        kind: 'text',
        ...(TRANSLATION_EXAMS.has(unit.itemType)
          ? { article: articleHint(unit.answer, plan.lang) }
          : {}),
      };
    case 'choice':
      return {
        ...base,
        kind: 'choice',
        options: order(
          unit.options.map((o) => ({
            ref: ref(paths.option(page, unit.itemId, o.id)),
            text: o.text,
            lang: o.lang,
          })),
        ),
        ...(unit.speak ? { speak: unit.speak } : {}),
      };
    case 'order':
      // A token bank is always shuffled; the distractors are in it, unmarked.
      return {
        ...base,
        kind: 'order',
        tokens: byRef(
          unit.tokens.map((t) => ({
            ref: ref(paths.token(page, unit.itemId, t.id)),
            text: t.text,
          })),
        ),
      };
    case 'spot':
      // The sentence keeps its order; the choices of a select-mode correction are shuffled.
      return {
        ...base,
        kind: 'spot',
        tokens: unit.tokens.map((t) => ({
          ref: ref(paths.token(page, unit.itemId, t.id)),
          text: t.text,
        })),
        correction: {
          mode: unit.correction.mode,
          choices: byRef(
            unit.correction.choices.map((text) => ({
              ref: ref(`${paths.unit(unit)}#s:${text}`),
              text,
            })),
          ).map((c) => c.text),
        },
      };
  }
}
