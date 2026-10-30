import { nativeLocales } from '../schemas/artifactCommon';
import {
  FUNCTIONS_LIMITS as L,
  FUNCTIONS_PAGE_RULES as R,
  FUNCTIONS_STAGES,
  type FunctionsBrief,
  type FunctionsContent,
  type FunctionsItem,
} from '../schemas/functions';
import { chunk } from '../domain/vocabularyLesson';
import { functionsPageEstimate, functionsTimeLimit } from '../domain/functionsLesson';
import { CHARACTER_ONLY, checkExplanations, sameSet } from './common';
import {
  hasGender,
  isArticle,
  nounGenders,
  startsWithArticle,
  TEACHING_ARTICLES,
  teachingArticle,
} from '../domain/articles';
import type { OutlineContext } from './artifacts';
import type { Issues } from './issues';

/**
 * The checks of a functions lesson beyond its schemas.
 *
 * The brief: ids and texts unique, every expression and word used in its
 * example sentence, nouns taught with their article (un thé, der Tee), and
 * translations that differ (they become the labels of a matching page).
 *
 * The content: one step per stage, in the order of FUNCTIONS_STAGES (the
 * gender step only when the lesson has nouns with a gender). Then, stage by
 * stage, the pages hold what the page rules say: every expression and word
 * where it belongs, roles that alternate in a dialogue, answers that contain
 * their expression, an exam with sentences the learner has not seen yet, and
 * page durations that follow FUNCTIONS_PAGE_RULES.
 */

type Stage = (typeof FUNCTIONS_STAGES)[number];
type Page = FunctionsContent['steps'][number]['pages'][number];
type Item<T extends FunctionsItem['type']> = Extract<FunctionsItem, { type: T }>;
type Expression = FunctionsBrief['expressions'][number];

const LANGUAGE_NAMES = { fr: 'French', de: 'German', en: 'English' } as const;

/**
 * A sentence in a form that compares: case, apostrophes, spaces and the
 * final punctuation do not count. "Je voudrais un thé !" → "je voudrais un thé".
 */
const plain = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .replace(/[\s.!?…]+$/u, '')
    .trim();

/** true when `text` contains `part`, both compared in their plain form. */
const contains = (text: string, part: string) => plain(text).includes(plain(part));

/** The items of `list` whose type is one of `types`. */
const ofType = <T extends FunctionsItem['type']>(list: FunctionsItem[], ...types: T[]) =>
  list.filter((it): it is Item<T> => (types as string[]).includes(it.type));

/* =================================================================== brief */

export function checkFunctionsBrief(b: FunctionsBrief, ctx: OutlineContext, issues: Issues) {
  const rule = TEACHING_ARTICLES[ctx.lang];
  issues.unique(
    [...b.expressions.map((e) => e.id), ...b.words.map((w) => w.id), ...b.roles.map((r) => r.id)],
    'expressions',
    'expression, word or role ID',
  );
  issues.unique(
    b.expressions.map((e) => plain(e.text)),
    'expressions',
    'expression text',
  );
  issues.unique(
    b.words.map((w) => plain(w.teachingForm)),
    'words',
    'word',
  );
  issues.unique(
    b.roles.map((r) => plain(r.label)),
    'roles',
    'role label',
  );

  // An expression that starts a sentence ("Je voudrais…") is written without the dots: openEnd says it.
  b.expressions.forEach((e, i) => {
    const p = `expressions.${i}`;
    issues.check(
      !/(\.\.\.|…)\s*$/u.test(e.text),
      `${p}.text`,
      'write sentence starts without the ellipsis and set openEnd',
    );
    issues.check(
      contains(e.example.text, e.text),
      `${p}.example`,
      `the example sentence must use the expression "${e.text}"`,
    );
    if (CHARACTER_ONLY.test(e.explanation.en))
      issues.add(
        `${p}.explanation`,
        'explanations name the mark (accent aigu, cédille…), not only the character',
      );
  });

  // The words follow the vocabulary rules: only nouns have genders, a French noun is taught as "un thé".
  b.words.forEach((w, i) => {
    const p = `words.${i}`;
    if (w.wordClass === 'noun') {
      if (hasGender(ctx.lang)) {
        issues.check(
          w.genders.length > 0,
          `${p}.genders`,
          'a noun needs at least one accepted gender',
        );
        issues.check(
          w.genders.every((g) => nounGenders(ctx.lang).includes(g)),
          `${p}.genders`,
          `${ctx.lang} nouns are ${nounGenders(ctx.lang).join(' or ')}`,
        );
      } else
        issues.check(w.genders.length === 0, `${p}.genders`, `${ctx.lang} nouns have no gender`);
      if (rule)
        issues.check(
          teachingArticle(ctx.lang, w.teachingForm) !== undefined,
          `${p}.teachingForm`,
          `"${w.teachingForm}" must include the ${rule.label}`,
        );
    } else issues.check(w.genders.length === 0, `${p}.genders`, 'only nouns have a gender');
    issues.check(
      !startsWithArticle(ctx.lang, w.term) && !isArticle(ctx.lang, w.term),
      `${p}.term`,
      `"${w.term}" must be the base term without article`,
    );
    issues.check(
      contains(w.example.text, w.term),
      `${p}.example`,
      `the example sentence must use the word "${w.term}"`,
    );
  });

  for (const locale of nativeLocales(ctx.lang)) {
    issues.unique(
      b.expressions.map((e) => e.translations[locale]?.[0] ?? ''),
      'expressions',
      `${locale} translation (matching labels must differ)`,
    );
    issues.unique(
      b.words.map((w) => w.translations[locale]?.[0] ?? ''),
      'words',
      `${locale} translation (matching labels must differ)`,
    );
  }
}

/* ================================================================= content */

/**
 * What the stage checks share: the brief's ids, the content's steps by
 * stage, and the checks that every stage uses. Built once by
 * checkFunctionsContent.
 */
interface Lesson {
  b: FunctionsBrief;
  issues: Issues;
  expressionIds: string[];
  wordIds: string[];
  nounIds: string[];
  expressions: Map<string, Expression>;
  /** The pages of a stage's step. */
  pages(stage: Stage): Page[];
  /** Every item of a stage's step, all its pages together. */
  items(stage: Stage): FunctionsItem[];
  /** How many items each page of a stage's step has. */
  pageSizes(stage: Stage): number[];
  /** Checks that a stage's step holds only items of these types, and returns them. */
  only<T extends FunctionsItem['type']>(stage: Stage, ...types: T[]): Item<T>[];
  /** Adds an issue when `id` is not a role of the brief; true when it is one. */
  role(id: string, path: string): boolean;
  /** Adds an issue when `id` is not an expression of the brief; true when it is one. */
  expression(id: string, path: string): boolean;
}

export function checkFunctionsContent(c: FunctionsContent, b: FunctionsBrief, issues: Issues) {
  const expressions = new Map(b.expressions.map((e) => [e.id, e]));
  const roles = new Set(b.roles.map((r) => r.id));
  const steps = new Map(c.steps.map((s) => [s.stage, s]));
  const pages = (stage: Stage) => steps.get(stage)!.pages;
  const items = (stage: Stage) => pages(stage).flatMap((pg) => pg.items);
  const l: Lesson = {
    b,
    issues,
    expressionIds: b.expressions.map((e) => e.id),
    wordIds: b.words.map((w) => w.id),
    nounIds: b.words.filter((w) => w.wordClass === 'noun' && w.genders.length > 0).map((w) => w.id),
    expressions,
    pages,
    items,
    pageSizes: (stage) => pages(stage).map((pg) => pg.items.length),
    only: (stage, ...types) => {
      const list = items(stage);
      issues.check(
        list.every((it) => (types as string[]).includes(it.type)),
        `steps.${stage}`,
        `the ${stage} step holds ${types.join(' and ')} items only`,
      );
      return ofType(list, ...types);
    },
    role: (id, path) => issues.check(roles.has(id), path, `unknown role ${id}`),
    expression: (id, path) => issues.check(expressions.has(id), path, `unknown expression ${id}`),
  };

  // The pages can only be looked at once every stage is in its place.
  if (!checkStages(c, l)) return;
  checkFlashcards(l);
  checkGender(l);
  checkModelDialogue(l);
  checkMatching(l);
  checkWordOrders(l);
  checkDialogueGaps(l);
  checkListening(l);
  checkExam(l);
  checkPageTimes(c, issues);
}

/** How a stage's step is shown: flashcards and dialogue are a presentation, exam is the exam. */
const stageRole = (stage: Stage) =>
  stage === 'exam'
    ? 'exam'
    : stage === 'flashcards' || stage === 'dialogue'
      ? 'presentation'
      : 'exercise';

/**
 * One step per stage, in order, each with its role; the gender step only
 * when the lesson has nouns with a gender. Returns true when all of that holds.
 */
function checkStages(c: FunctionsContent, { nounIds, issues }: Lesson): boolean {
  const before = issues.list.length;
  const stages = FUNCTIONS_STAGES.filter((s) => s !== 'gender' || nounIds.length > 0);
  issues.check(
    c.steps.length === stages.length,
    'steps',
    `expected ${stages.length} steps: ${stages.join(', ')}`,
  );
  c.steps.forEach((s, i) => {
    issues.check(
      s.stage === stages[i],
      `steps.${i}.stage`,
      `expected the ${stages[i]} step here (FUNCTIONS_STAGES)`,
    );
    issues.check(
      s.role === stageRole(s.stage),
      `steps.${i}.role`,
      `wrong role for the ${s.stage} step`,
    );
  });
  return issues.list.length === before;
}

/** The page durations follow the page rules; only exam pages have a countdown, 1.5 × the duration. */
function checkPageTimes(c: FunctionsContent, issues: Issues) {
  c.steps.forEach((s, si) =>
    s.pages.forEach((pg, pi) => {
      const pp = `steps.${si}.pages.${pi}`;
      const exam = s.stage === 'exam';
      const estimate = functionsPageEstimate(pg.items, exam);
      issues.check(
        pg.estimatedDurationS === estimate,
        `${pp}.estimatedDurationS`,
        `must be ${estimate} s by FUNCTIONS_PAGE_RULES`,
      );
      const limit = exam ? functionsTimeLimit(estimate) : null;
      issues.check(
        pg.timeLimitS === limit,
        `${pp}.timeLimitS`,
        limit === null ? 'only exam pages have a countdown' : `must be ${limit} s (1.5 × estimate)`,
      );
    }),
  );
}

/* ============================================================ presentation */

/** Flashcards: one page with every word (when the lesson has words), then one page with every expression. */
function checkFlashcards(l: Lesson) {
  const cards = l.only('flashcards', 'function_flashcards');
  const deck = [
    ...(l.wordIds.length ? [['words', l.wordIds] as const] : []),
    ['expressions', l.expressionIds] as const,
  ];
  l.issues.check(
    cards.length === deck.length &&
      l.pageSizes('flashcards').every((n) => n === 1) &&
      deck.every(([side, ids], n) => cards[n].side === side && sameSet(cards[n].ids, ids)),
    'steps.flashcards',
    'one page with every word (when the lesson has words), then one page with every expression',
  );
}

/** Gender: one page with every noun, in brief order. The other words are left out. */
function checkGender(l: Lesson) {
  if (!l.nounIds.length) return;
  const gender = l.only('gender', 'function_gender_select');
  l.issues.check(
    gender.length === 1 &&
      l.pageSizes('gender').length === 1 &&
      gender[0].ids.join() === l.nounIds.join(),
    'steps.gender',
    'one gender page with every noun in brief order',
  );
}

/** The model dialogue: one item on one page, roles that alternate, every expression used. */
function checkModelDialogue(l: Lesson) {
  const { issues, expressions } = l;
  const dialogue = l.only('dialogue', 'function_dialogue');
  if (
    !issues.check(
      dialogue.length === 1,
      'steps.dialogue',
      'the model dialogue is one item on one page',
    )
  )
    return;
  const lines = dialogue[0].lines;
  issues.unique(
    lines.map((line) => line.lineId),
    'steps.dialogue',
    'line ID',
  );
  lines.forEach((line, n) => {
    const p = `steps.dialogue.lines.${n}`;
    l.role(line.roleId, p);
    if (n > 0) issues.check(line.roleId !== lines[n - 1].roleId, p, 'the roles alternate');
    for (const id of line.expressionIds)
      if (l.expression(id, p)) {
        const expression = expressions.get(id)!.text;
        issues.check(
          contains(line.text, expression),
          p,
          `the line does not contain the expression "${expression}"`,
        );
      }
  });
  const used = new Set(lines.flatMap((line) => line.expressionIds));
  for (const id of l.expressionIds)
    issues.check(
      used.has(id),
      'steps.dialogue',
      `the model dialogue does not use expression ${id}`,
    );
}

/* =============================================================== exercises */

/** Matching: the expressions on balanced pages of at most six pairs, then the words on a page of their own. */
function checkMatching(l: Lesson) {
  const matching = l.only('matching', 'function_matching');
  const expected = [
    ...chunk(l.expressionIds, R.matchingPageSize).map((ids) => ['expressions', ids] as const),
    ...(l.wordIds.length ? [['words', l.wordIds] as const] : []),
  ];
  l.issues.check(
    matching.length === expected.length &&
      l.pageSizes('matching').every((n) => n === 1) &&
      expected.every(
        ([side, ids], n) =>
          matching[n].side === side && matching[n].pairs.map((p) => p.id).join() === ids.join(),
      ),
    'steps.matching',
    `matching pages: ${expected.map(([side, ids]) => `${ids.length} ${side}`).join(', ')} in brief order (at most ${R.matchingPageSize} pairs per page; words on their own page)`,
  );
}

/** The word order, dialogue gap and listening steps: one item per page, one item per expression. */
function checkOnePerExpression(
  l: Lesson,
  stage: 'word_order' | 'dialogue_gaps' | 'listening',
  list: { expressionId: string }[],
) {
  l.issues.check(
    l.pageSizes(stage).every((n) => n === 1),
    `steps.${stage}`,
    'one item per page',
  );
  l.issues.check(
    sameSet(
      list.map((it) => it.expressionId),
      l.expressionIds,
    ),
    `steps.${stage}`,
    'exactly one item per expression',
  );
}

/** Word order: the tokens of a sentence with the expression; no context, role or extra tokens yet. */
function checkWordOrders(l: Lesson) {
  const orders = l.only('word_order', 'function_word_order');
  checkOnePerExpression(l, 'word_order', orders);
  orders.forEach((it, n) => {
    const p = `steps.word_order.items.${n}`;
    l.issues.check(
      it.context === null && it.roleId === null && it.distractorTokenIds.length === 0,
      p,
      'practice word order has tokens only: no context, role or distractors',
    );
    checkWordOrder(it, p, l);
  });
}

/**
 * Dialogue gaps: one role's line as context, then the other role's line
 * with a gap, to fill with one of four expressions (the answer and three
 * others).
 */
function checkDialogueGaps(l: Lesson) {
  const { issues } = l;
  const gaps = l.only('dialogue_gaps', 'function_dialogue_gap_choice');
  checkOnePerExpression(l, 'dialogue_gaps', gaps);
  gaps.forEach((it, n) => {
    const p = `steps.dialogue_gaps.items.${n}`;
    l.role(it.context.roleId, `${p}.context`);
    l.role(it.roleId, p);
    issues.check(it.context.roleId !== it.roleId, p, 'the gap line belongs to the other role');
    issues.check(
      it.before === it.before.trim() && it.after === it.after.trim(),
      p,
      'before and after carry no surrounding spaces (the renderer adds them)',
    );
    issues.check(
      new Set(it.choiceExpressionIds).size === 4 &&
        it.choiceExpressionIds.includes(it.expressionId),
      `${p}.choiceExpressionIds`,
      'four distinct expressions including the answer',
    );
    it.choiceExpressionIds.forEach((id) => l.expression(id, `${p}.choiceExpressionIds`));
    checkExplanations([it], p, issues);
  });
}

/**
 * Listening: one role's line as context, then four spoken replies of the
 * other role to choose from; the right one uses the expression.
 */
function checkListening(l: Lesson) {
  const { issues, expressions } = l;
  const listening = l.only('listening', 'function_listening_choice');
  checkOnePerExpression(l, 'listening', listening);
  listening.forEach((it, n) => {
    const p = `steps.listening.items.${n}`;
    l.role(it.context.roleId, `${p}.context`);
    l.role(it.roleId, p);
    issues.check(it.context.roleId !== it.roleId, p, 'the reply belongs to the other role');
    issues.unique(
      it.options.map((o) => o.optionId),
      p,
      'option ID',
    );
    issues.unique(
      it.options.map((o) => plain(o.text)),
      p,
      'option text',
    );
    const answer = it.options.find((o) => o.optionId === it.answerOptionId);
    if (
      issues.check(answer !== undefined, p, 'answerOptionId must be one of the options') &&
      answer &&
      l.expression(it.expressionId, p)
    ) {
      const expression = expressions.get(it.expressionId)!.text;
      issues.check(
        contains(answer.text, expression),
        p,
        `the answer does not contain the expression "${expression}"`,
      );
    }
    checkExplanations([it], p, issues);
  });
}

/** The sentence of a word-order item: its tokens in the first accepted order. */
const sentence = (it: Item<'function_word_order'>) =>
  it.acceptedOrders[0].map((id) => it.tokens.find((t) => t.tokenId === id)?.text ?? '').join(' ');

/**
 * A word-order item, in practice or in the exam: every accepted order
 * uses every token but the distractors exactly once, and the sentence
 * contains its expression.
 */
function checkWordOrder(it: Item<'function_word_order'>, path: string, l: Lesson) {
  const { issues } = l;
  const all = it.tokens.map((t) => t.tokenId);
  issues.unique(all, path, 'token ID');
  issues.check(
    it.distractorTokenIds.every((id) => all.includes(id)),
    path,
    'distractors must be tokens of the item',
  );
  const used = all.filter((id) => !it.distractorTokenIds.includes(id));
  for (const order of it.acceptedOrders)
    issues.check(
      order.length === used.length && sameSet(order, used),
      path,
      'each accepted order uses every token except the distractors exactly once',
    );
  const e = l.expressions.get(it.expressionId);
  if (issues.check(e !== undefined, path, `unknown expression ${it.expressionId}`) && e)
    issues.check(
      contains(sentence(it), e.text),
      path,
      `the sentence does not contain the expression "${e.text}"`,
    );
  checkExplanations([it], path, issues);
}

/* ==================================================================== exam */

/**
 * The exam, page by page:
 *
 *   translation    every word once (only when the lesson has words)
 *   replies        word orders answering a line of the other role,
 *                  4 to 8 of them, on balanced pages of at most 4
 *   exam dialogue  one page: a dialogue with 3 to 10 gaps to type
 *
 * Together, the replies and the gaps examine every expression, in
 * sentences the learner has not met in the brief or in practice.
 */
function checkExam(l: Lesson) {
  const { issues } = l;
  const allPages = l.pages('exam');
  const hasWords = l.wordIds.length > 0;
  if (hasWords) checkTranslationPage(l, allPages[0]?.items ?? []);

  const pages = hasWords ? allPages.slice(1) : allPages;
  const replyPages = pages.slice(0, -1);
  const last = pages.at(-1)!.items;
  issues.check(
    replyPages.every((pg) => pg.items.every((it) => it.type === 'function_word_order')) &&
      last.length === 1 &&
      last[0].type === 'function_dialogue_gap_typing',
    'steps.exam',
    'reply pages (word order) followed by one page with the exam dialogue',
  );
  const replies = ofType(
    replyPages.flatMap((pg) => pg.items),
    'function_word_order',
  );
  issues.check(
    replies.length >= L.examReplies[0] && replies.length <= L.examReplies[1],
    'steps.exam',
    `the exam has ${L.examReplies[0]}–${L.examReplies[1]} replies`,
  );
  const sizes = (lists: unknown[][]) => lists.map((x) => x.length).join();
  issues.check(
    sizes(replyPages.map((pg) => pg.items)) === sizes(chunk(replies, R.replyPageSize)),
    'steps.exam',
    `replies stand in balanced pages of at most ${R.replyPageSize}`,
  );

  const seen = practiceSentences(l);
  replies.forEach((it, n) => checkReply(l, it, `steps.exam.replies.${n}`, seen));
  const examined = new Set(replies.map((it) => it.expressionId));
  if (last[0]?.type === 'function_dialogue_gap_typing')
    checkExamDialogue(l, last[0], seen, examined);
  for (const id of l.expressionIds)
    issues.check(examined.has(id), 'steps.exam', `the exam does not assess expression ${id}`);
}

/** The first exam page, when the lesson has words: every word once, in brief order, its teaching form accepted. */
function checkTranslationPage(l: Lesson, items: FunctionsItem[]) {
  const { issues } = l;
  if (
    !issues.check(
      items.length > 0 && items.every((it) => it.type === 'function_translation_exam'),
      'steps.exam',
      'the exam starts with one page translating every word of the lesson',
    )
  )
    return;
  const translations = ofType(items, 'function_translation_exam');
  issues.check(
    translations.map((it) => it.wordId).join() === l.wordIds.join(),
    'steps.exam',
    'the translation page has every word once, in brief order',
  );
  translations.forEach((it, n) => {
    const p = `steps.exam.translation.${n}`;
    const w = l.b.words.find((x) => x.id === it.wordId);
    if (w)
      issues.check(
        it.accepted.answers.includes(w.teachingForm),
        p,
        `accepts the teaching form "${w.teachingForm}"`,
      );
    checkExplanations([it], p, issues);
  });
}

/**
 * Every sentence the learner has met before the exam, in plain form: the
 * brief's examples, and the sentences of the practice steps with their
 * answer filled in.
 */
function practiceSentences(l: Lesson): Set<string> {
  const { b, expressions } = l;
  return new Set([
    ...b.expressions.map((e) => plain(e.example.text)),
    ...b.words.map((w) => plain(w.example.text)),
    ...ofType(l.items('word_order'), 'function_word_order').map((it) => plain(sentence(it))),
    ...ofType(l.items('dialogue_gaps'), 'function_dialogue_gap_choice').map((it) =>
      plain(`${it.before} ${expressions.get(it.expressionId)?.text ?? ''} ${it.after}`),
    ),
    ...ofType(l.items('dialogue'), 'function_dialogue').flatMap((d) =>
      d.lines.map((line) => plain(line.text)),
    ),
    ...ofType(l.items('listening'), 'function_listening_choice').map((it) =>
      plain(it.options.find((o) => o.optionId === it.answerOptionId)?.text ?? ''),
    ),
  ]);
}

/** A reply: a word order that answers the other role's line, with a sentence the learner has not met. */
function checkReply(l: Lesson, it: Item<'function_word_order'>, p: string, seen: Set<string>) {
  const { issues } = l;
  if (
    issues.check(
      it.context !== null && it.roleId !== null,
      p,
      "an exam reply has role A's line as context and the role of the reply",
    )
  ) {
    l.role(it.context!.roleId, `${p}.context`);
    l.role(it.roleId!, p);
    issues.check(it.context!.roleId !== it.roleId, p, 'the reply belongs to the other role');
  }
  checkWordOrder(it, p, l);
  issues.check(
    !seen.has(plain(sentence(it))),
    p,
    `"${sentence(it)}" already occurs in the brief or in practice`,
  );
}

/**
 * The exam dialogue: roles that alternate, 3 to 10 lines with a gap to
 * type. A gap's answers include its expression, its translation does not
 * give the answer away, and its line is new to the learner. A line
 * without a gap keeps all its text in `before`. Each gap's expression is
 * added to `examined`.
 */
function checkExamDialogue(
  l: Lesson,
  dialogue: Item<'function_dialogue_gap_typing'>,
  seen: Set<string>,
  examined: Set<string>,
) {
  const { issues, expressions } = l;
  const { lines } = dialogue;
  const p = 'steps.exam.dialogue';
  issues.unique(
    lines.map((line) => line.lineId),
    p,
    'line ID',
  );
  issues.unique(
    lines.flatMap((line) => (line.gap ? [line.gap.gapId] : [])),
    p,
    'gap ID',
  );
  const gapCount = lines.filter((line) => line.gap).length;
  issues.check(
    gapCount >= L.examGaps[0] && gapCount <= L.examGaps[1],
    p,
    `the exam dialogue has ${L.examGaps[0]}–${L.examGaps[1]} gaps`,
  );

  lines.forEach((line, n) => {
    const lp = `${p}.lines.${n}`;
    const { gap } = line;
    l.role(line.roleId, lp);
    if (n > 0) issues.check(line.roleId !== lines[n - 1].roleId, lp, 'the roles alternate');
    issues.check(
      gap !== null || (line.before.trim() !== '' && line.after === ''),
      lp,
      'a line without a gap keeps its whole text in before',
    );
    issues.check(
      line.before === line.before.trim() && line.after === line.after.trim(),
      lp,
      'before and after carry no surrounding spaces (the renderer adds them)',
    );
    if (!gap) return;
    if (l.expression(gap.expressionId, lp)) {
      const expression = expressions.get(gap.expressionId)!.text;
      examined.add(gap.expressionId);
      issues.check(
        gap.accepted.answers.some((a) => plain(a) === plain(expression)),
        lp,
        `the accepted answers include the expression "${expression}"`,
      );
      checkExplanations([gap], lp, issues);
    }
    const answer = gap.accepted.answers[0];
    issues.check(
      Object.values(line.translation).every((tr) => !contains(tr, answer)),
      lp,
      `the translation must not contain the ${LANGUAGE_NAMES[l.b.lang]} answer`,
    );
    issues.check(
      !seen.has(plain(`${line.before} ${answer} ${line.after}`)),
      lp,
      'the line already occurs in the brief or in practice',
    );
  });
}
