import {
  PERSON_MATCHING_EXEMPT,
  PERSON_MATCHING_TOPICS,
  PERSONS,
  PRONOUN_FORM_TOPICS,
  PRONOUN_FORM_TYPES,
  type GrammarBrief,
  type GrammarContent,
  type GrammarItem,
} from '../schemas/grammar';
import type { Language } from '../../schemas/language';
import { checkExplanations, checkMinutes, checkRichText, sameSet, sum } from './common';
import type { Issues } from './issues';

/**
 * The checks of a grammar lesson beyond its schemas.
 *
 * The brief must hold together: every rule is taught in a block and
 * examined, every exercise practises rules of its block, and the
 * person-by-person exercises appear only in lessons about persons.
 *
 * The content must follow the brief step by step:
 *
 *   brief                               content
 *   block b1 ─ rules r1, r2             explanation b1 ─ explains r1, r2
 *            ─ exercise e1 (3 gaps)  →  exercise e1    ─ exactly 3 gaps on r1, r2
 *   block b2 ─ …                        explanation b2 …
 *   feedback, exam pages p1, p2         feedback, exam ─ pages p1, p2 as planned
 *
 * and each item must be right in itself: the answer is one of the
 * choices, an order uses every token… The exam uses fresh sentences, not
 * ones from the lesson.
 *
 * The length rules are separate: see grammarLength.ts.
 */

/* =================================================================== brief */

/**
 * The person-by-person exercises (je suis, tu es…) only fit a topic whose
 * forms change with the person: pronouns and verbs, not negation.
 */
function checkPronounFormTopic(b: GrammarBrief, type: string, path: string, issues: Issues) {
  if (!PRONOUN_FORM_TYPES.includes(type as never)) return;
  issues.check(
    (PRONOUN_FORM_TOPICS as readonly string[]).includes(b.topic),
    path,
    `${type} suits only ${PRONOUN_FORM_TOPICS.join(', ')} topics, not ${b.topic}; use gaps or word order`,
  );
}

export function checkGrammarBrief(b: GrammarBrief, issues: Issues) {
  const rules = new Set(b.rules.map((r) => r.id));
  issues.unique(
    b.rules.map((r) => r.id),
    'rules',
    'rule ID',
  );
  issues.unique(
    b.blocks.map((x) => x.id),
    'blocks',
    'block ID',
  );
  issues.unique(
    b.blocks.flatMap((x) => x.exercises.map((e) => e.id)),
    'blocks',
    'exercise ID',
  );
  issues.unique(
    b.exam.pages.map((pg) => pg.pageId),
    'exam.pages',
    'page ID',
  );

  // Teaching: each block teaches known rules, and its exercises practise them. A person
  // matching board may also review the persons of an earlier block (singular, then plural).
  const taught = new Set<string>();
  b.blocks.forEach((block, i) => {
    for (const r of block.ruleIds) {
      issues.check(rules.has(r), `blocks.${i}.ruleIds`, `unknown rule ${r}`);
      taught.add(r);
    }
    block.exercises.forEach((ex, j) => {
      const review = ex.type === 'grammar_person_matching';
      for (const r of ex.ruleIds)
        issues.check(
          block.ruleIds.includes(r) || (review && taught.has(r)),
          `blocks.${i}.exercises.${j}.ruleIds`,
          `rule ${r} is not taught in this block${review ? ' or an earlier one' : ''}`,
        );
      checkPronounFormTopic(b, ex.type, `blocks.${i}.exercises.${j}.type`, issues);
    });
  });
  for (const r of rules) issues.check(taught.has(r), 'blocks', `rule ${r} is never taught`);
  if (
    PERSON_MATCHING_TOPICS[b.lang].includes(b.topic) &&
    !PERSON_MATCHING_EXEMPT[b.lang].includes(b.id)
  )
    issues.check(
      b.blocks.some((x) => x.exercises.some((e) => e.type === 'grammar_person_matching')),
      'blocks',
      `${b.topic} lessons include a grammar_person_matching exercise`,
    );
  issues.unique(
    b.newVerbs.map((v) => v.infinitive),
    'newVerbs',
    'infinitive',
  );

  // The exam: known rules, and every rule examined.
  b.exam.pages.forEach((pg, i) => {
    for (const r of pg.ruleIds)
      issues.check(rules.has(r), `exam.pages.${i}.ruleIds`, `unknown rule ${r}`);
    checkPronounFormTopic(b, pg.type, `exam.pages.${i}.type`, issues);
  });
  const examined = new Set(b.exam.pages.flatMap((pg) => pg.ruleIds));
  for (const r of rules)
    issues.check(examined.has(r), 'exam.pages', `the exam does not cover rule ${r}`);

  const blockSeconds = b.blocks.map(
    (x) => x.explanationDurationS + sum(x.exercises.map((e) => e.estimatedDurationS)),
  );
  checkMinutes(
    b.estimatedMinutes,
    sum(blockSeconds) +
      b.feedbackPlaceholder.estimatedDurationS +
      sum(b.exam.pages.map((pg) => pg.estimatedDurationS)),
    issues,
  );
}

/* ================================================================= content */

type PlannedExercise = GrammarBrief['blocks'][number]['exercises'][number];
type ExamPlan = GrammarBrief['exam']['pages'][number];
type GrammarStep = GrammarContent['steps'][number];

/** One step the brief asks for, in the order the content must have them. */
interface PlannedStep {
  role: 'explanation' | 'exercise' | 'feedback' | 'exam';
  blockId: string | null;
  exercise?: PlannedExercise;
}

/** Per block, its explanation then one step per exercise; then the feedback and the exam. */
const plannedSteps = (b: GrammarBrief): PlannedStep[] => [
  ...b.blocks.flatMap((block) => [
    { role: 'explanation' as const, blockId: block.id },
    ...block.exercises.map((exercise) => ({
      role: 'exercise' as const,
      blockId: block.id,
      exercise,
    })),
  ]),
  { role: 'feedback', blockId: null },
  { role: 'exam', blockId: null },
];

export function checkGrammarContent(c: GrammarContent, b: GrammarBrief, issues: Issues) {
  const rules = new Set(b.rules.map((r) => r.id));
  const planned = plannedSteps(b);
  if (
    !issues.check(
      c.steps.length === planned.length,
      'steps',
      `expected ${planned.length} steps from the brief's blocks, exercises, feedback and exam`,
    )
  )
    return;
  const examPlan = new Map(b.exam.pages.map((pg) => [pg.pageId, pg]));

  c.steps.forEach((step, si) => {
    const want = planned[si];
    checkStep(step, want, `steps.${si}`, b, issues);
    step.pages.forEach((page, pi) => {
      const pp = `steps.${si}.pages.${pi}`;
      if (want.role === 'exam') checkExamPage(page, examPlan.get(page.pageId), pp, issues);
      else
        issues.check(
          page.timeLimitS === null,
          `${pp}.timeLimitS`,
          'only exam pages have a countdown',
        );
      page.items.forEach((item, ii) =>
        checkGrammarItem(item, `${pp}.items.${ii}`, rules, want.role === 'exam', b.lang, issues),
      );
    });
  });

  const exam = c.steps[c.steps.length - 1];
  issues.check(
    sameSet(
      exam.pages.map((pg) => pg.pageId),
      [...examPlan.keys()],
    ),
    'steps',
    'exam pages must match the brief exam plan',
  );
  checkFreshExam(c, issues);
}

/** A step is the one the brief plans at its place, and holds what that plan says. */
function checkStep(
  step: GrammarStep,
  want: PlannedStep,
  sp: string,
  b: GrammarBrief,
  issues: Issues,
) {
  issues.check(
    step.role === want.role && step.blockId === want.blockId,
    sp,
    `expected a ${want.role} step${want.blockId ? ` for block ${want.blockId}` : ''}`,
  );
  const items = step.pages.flatMap((pg) => pg.items);
  switch (want.role) {
    case 'explanation': {
      issues.check(
        items.every((it) => it.type === 'grammar_explanation'),
        sp,
        'explanation steps contain explanations only',
      );
      const block = b.blocks.find((x) => x.id === want.blockId)!;
      for (const it of items)
        if ('ruleIds' in it)
          for (const r of it.ruleIds)
            issues.check(
              block.ruleIds.includes(r),
              sp,
              `rule ${r} is not taught in block ${block.id}`,
            );
      break;
    }
    case 'feedback':
      issues.check(
        items.length === 1 && items[0].type === 'production_feedback_placeholder',
        sp,
        'the feedback step is the fixed production placeholder',
      );
      break;
    case 'exercise': {
      const ex = want.exercise!;
      issues.check(
        items.every((it) => it.type === ex.type),
        sp,
        `planned exercise ${ex.id} is ${ex.type}`,
      );
      if (ex.type === 'grammar_person_matching')
        issues.check(
          step.pages.every((pg) => pg.items.length === 1),
          sp,
          'each person matching board has a page of its own',
        );
      issues.check(
        items.length === ex.itemCount,
        sp,
        `planned exercise ${ex.id} has ${ex.itemCount} items`,
      );
      checkRuleCoverage(items, ex.ruleIds, sp, `planned exercise ${ex.id}`, issues);
      break;
    }
  }
}

/** An exam page is in the brief's exam plan, with its countdown, item type and count, and rules. */
function checkExamPage(
  page: GrammarStep['pages'][number],
  plan: ExamPlan | undefined,
  pp: string,
  issues: Issues,
) {
  if (
    !issues.check(
      plan !== undefined,
      `${pp}.pageId`,
      `exam page ${page.pageId} is not in the brief's exam plan`,
    ) ||
    !plan
  )
    return;
  issues.check(
    page.timeLimitS === plan.timeLimitS,
    `${pp}.timeLimitS`,
    `must equal the brief's limit ${plan.timeLimitS}s`,
  );
  issues.check(
    page.items.every((it) => it.type === plan.type) && page.items.length === plan.itemCount,
    `${pp}.items`,
    `page plan expects ${plan.itemCount} ${plan.type} items`,
  );
  checkRuleCoverage(page.items, plan.ruleIds, `${pp}.items`, `exam page ${plan.pageId}`, issues);
}

/**
 * The items of an exercise or exam page assess only the rules planned for
 * it, and together they assess all of them. `label` names the plan in the
 * message: "planned exercise e1", "exam page p2".
 */
function checkRuleCoverage(
  items: GrammarItem[],
  planned: string[],
  path: string,
  label: string,
  issues: Issues,
) {
  const assessed = new Set(items.flatMap((it) => ('ruleIds' in it ? it.ruleIds : [])));
  for (const r of assessed)
    issues.check(planned.includes(r), path, `rule ${r} is not planned for ${label}`);
  for (const r of planned)
    issues.check(assessed.has(r), path, `no item of ${label} assesses rule ${r}`);
}

/* =================================================================== items */

/**
 * One item, whatever its step: known rules, unique token ids, and the
 * checks of its type. `exam` is true on an exam page, where a typed gap
 * gets no hint.
 */
function checkGrammarItem(
  item: GrammarItem,
  path: string,
  rules: Set<string>,
  exam: boolean,
  lang: Language,
  issues: Issues,
) {
  if ('ruleIds' in item)
    for (const r of item.ruleIds)
      issues.check(rules.has(r), `${path}.ruleIds`, `unknown rule ${r}`);
  const tokens = 'tokens' in item ? item.tokens : [];
  issues.unique(
    tokens.map((t) => t.tokenId),
    path,
    'token ID',
  );

  switch (item.type) {
    case 'grammar_explanation':
      checkRichText(item.text, `${path}.text`, issues);
      break;
    case 'grammar_gap_choice':
      issues.unique(
        item.choices.map((ch) => ch.choiceId),
        path,
        'choice ID',
      );
      issues.unique(
        item.choices.map((ch) => ch.text),
        path,
        'choice text',
      );
      issues.check(
        item.choices.some((ch) => ch.choiceId === item.answerChoiceId),
        path,
        'answerChoiceId must be one of the choices',
      );
      issues.check(
        !/\(.*\)/.test(`${item.before} ${item.after}`),
        path,
        'put cues into hint (shown above the sentence), not in parentheses inside the sentence',
      );
      break;
    case 'grammar_gap_typing':
      if (exam) issues.check(item.hint === null, path, 'exam gaps have no hint');
      break;
    case 'grammar_pronoun_form_match':
      issues.unique(
        item.rows.map((r) => r.rowId),
        path,
        'row ID',
      );
      for (const r of item.rows)
        issues.check(
          tokens.some((t) => r.validForms.includes(t.text)),
          path,
          `row ${r.rowId} has no token with a valid form`,
        );
      checkExplanations(item.rows, path, issues);
      break;
    case 'grammar_person_matching':
      checkPersonMatching(item, path, lang, issues);
      break;
    case 'grammar_pronoun_form_typing':
      issues.unique(
        item.rows.map((r) => r.rowId),
        path,
        'row ID',
      );
      checkExplanations(item.rows, path, issues);
      break;
    case 'grammar_word_order': {
      const all = tokens.map((t) => t.tokenId);
      for (const order of item.acceptedOrders)
        issues.check(
          order.length === all.length && sameSet(order, all),
          path,
          'each accepted order uses every token exactly once',
        );
      break;
    }
    case 'grammar_error_spotter':
      checkErrorSpotter(item, path, issues);
      break;
  }
  if ('answerExplanation' in item) checkExplanations([item], path, issues);
}

/**
 * A person matching board: its rows follow the persons in order, the
 * three singular ones, the three plural ones, or all six. In translation
 * mode a row shows a sentence in the mother tongue ("I am"); in forms
 * mode it shows a pronoun ("je"). Two rows never show the same prompt,
 * except English 2sg and 2pl, which are both "you are".
 */
function checkPersonMatching(
  item: Extract<GrammarItem, { type: 'grammar_person_matching' }>,
  path: string,
  lang: Language,
  issues: Issues,
) {
  const persons = item.rows.map((r) => r.person).join(',');
  const allowed = [PERSONS.slice(0, 3), PERSONS.slice(3), PERSONS].map((b) => b.join(','));
  issues.check(
    allowed.includes(persons),
    `${path}.rows`,
    `persons must be ${allowed.map((b) => `[${b}]`).join(' or ')} in this order, not [${persons}]`,
  );
  const translation = item.mode === 'translation';
  item.rows.forEach((r, n) =>
    issues.check(
      translation
        ? r.native !== null && r.pronoun === null
        : r.pronoun !== null && r.native === null,
      `${path}.rows.${n}`,
      translation
        ? 'translation rows have a native prompt and no pronoun'
        : 'forms rows have a pronoun and no native prompt',
    ),
  );
  if (translation) {
    const locales = [...new Set(item.rows.flatMap((r) => Object.keys(r.native ?? {})))];
    for (const locale of locales)
      issues.unique(
        item.rows.map((r) => (r.native as Record<string, string> | null)?.[locale] ?? ''),
        path,
        `${locale} prompt`,
      );
  } else {
    // English "you" is both 2sg and 2pl: the 2pl row may repeat the 2sg row, pronoun and form.
    const sg = item.rows.find((r) => r.person === '2sg');
    const you = (r: (typeof item.rows)[number]) =>
      lang === 'en' &&
      r.person === '2pl' &&
      sg !== undefined &&
      r.pronoun === sg.pronoun &&
      r.answer === sg.answer;
    issues.unique(
      item.rows.filter((r) => !you(r)).map((r) => r.pronoun ?? ''),
      path,
      'pronoun',
    );
  }
  checkExplanations(item.rows, path, issues);
}

/**
 * An error spotter: the learner finds the wrong token, then corrects it,
 * by choosing (select mode, 2 to 4 choices) or by typing (type mode, no
 * choices). The correction must differ from the wrong token.
 */
function checkErrorSpotter(
  item: Extract<GrammarItem, { type: 'grammar_error_spotter' }>,
  path: string,
  issues: Issues,
) {
  const { correction } = item;
  const faulty = item.tokens.find((t) => t.tokenId === item.faultyTokenId);
  if (issues.check(faulty !== undefined, path, 'faultyTokenId must be one of the tokens') && faulty)
    issues.check(
      !correction.accepted.answers.includes(faulty.text),
      path,
      'the correction must differ from the faulty token',
    );
  if (correction.mode === 'select')
    issues.check(
      correction.choices.length >= 2 &&
        correction.choices.some((ch) => correction.accepted.answers.includes(ch)),
      path,
      'select mode needs 2–4 choices including an accepted answer',
    );
  else issues.check(correction.choices.length === 0, path, 'type mode has no choices');
}

/* ============================================================== fresh exam */

/**
 * The exam tests the rules on new sentences: no exam sentence may repeat
 * an explanation example or a practice sentence. Sentences are compared
 * with their answer filled in, ignoring case and punctuation.
 */
function checkFreshExam(c: GrammarContent, issues: Issues) {
  const last = c.steps.length - 1;
  const taught = new Set(
    c.steps
      .slice(0, -1)
      .flatMap((step) => step.pages.flatMap((pg) => pg.items.flatMap(grammarSentences))),
  );
  c.steps[last].pages.forEach((page, pi) =>
    page.items.forEach((item, ii) => {
      for (const sentence of grammarSentences(item))
        issues.check(
          !taught.has(sentence),
          `steps.${last}.pages.${pi}.items.${ii}`,
          `the exam repeats "${sentence}" from the lesson; use a fresh example`,
        );
    }),
  );
}

/** A sentence in a form that compares: "Je ne suis pas -> là !" → "je ne suis pas là". */
const comparable = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/->|→/g, ' ')
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

/** The full sentences of an item, with the answer filled in. Row items and the placeholder have none. */
function grammarSentences(item: GrammarItem): string[] {
  const text = (tokens: { tokenId: string; text: string }[], id: string) =>
    tokens.find((t) => t.tokenId === id)?.text ?? '';
  switch (item.type) {
    case 'grammar_explanation':
      return item.examples.map((e) => comparable(e.text));
    case 'grammar_gap_typing':
      return [comparable(`${item.before} ${item.accepted.answers[0]} ${item.after}`)];
    case 'grammar_gap_choice': {
      const answer = item.choices.find((ch) => ch.choiceId === item.answerChoiceId)?.text ?? '';
      return [comparable(`${item.before} ${answer} ${item.after}`)];
    }
    case 'grammar_word_order':
      return [comparable(item.acceptedOrders[0].map((id) => text(item.tokens, id)).join(' '))];
    case 'grammar_error_spotter':
      return [
        comparable(
          item.tokens
            .map((t) =>
              t.tokenId === item.faultyTokenId ? item.correction.accepted.answers[0] : t.text,
            )
            .join(' '),
        ),
      ];
    default:
      return [];
  }
}
