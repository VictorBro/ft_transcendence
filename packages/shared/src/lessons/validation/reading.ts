import { nativeLocales } from '../schemas/artifactCommon';
import type { Level } from '../../schemas/item';
import {
  READING_LIMITS,
  READING_STAGES,
  READING_WORDS,
  type ReadingBrief,
  type ReadingContent,
  type ReadingItem,
  type ReadingStage,
} from '../schemas/reading';
import {
  documentWords,
  highlightRanges,
  readingPageEstimate,
  readingTimeLimit,
} from '../domain/readingLesson';
import { sameSet } from './common';
import type { Issues } from './issues';

/**
 * The checks of a reading lesson beyond its schemas.
 *
 * The brief: unique key words with distinct translations (they become
 * matching labels), and planned documents of the right length for the
 * level.
 *
 * The content follows the brief and the page rules:
 * - the documents: one main and one exam document, of the right length,
 *   every key word highlighted in the main one;
 * - the steps: the six stages in order, one page each, the document
 *   first on its page in the view of its stage;
 * - the pages: flashcards and matching cover every key word, the skim
 *   and detail questions are the planned ones, the structure task uses
 *   every piece;
 * - the exam: five questions of the planned types about a new document,
 *   none of them asked before;
 * - the times: page durations and the exam countdown follow the page
 *   rules (../domain/readingLesson.ts computes them).
 */

/* =================================================================== brief */

/**
 * A document's word count is within the range of the level
 * (READING_WORDS): 40 to 80 words for an A1 main document.
 */
function checkWords(
  words: number,
  [min, max]: readonly [number, number],
  path: string,
  what: string,
  issues: Issues,
) {
  issues.check(
    words >= min && words <= max,
    path,
    `${what} has ${words} words; ${min}–${max} expected at this level (whitespace-separated tokens with a letter or digit)`,
  );
}

export function checkReadingBrief(b: ReadingBrief, issues: Issues) {
  const range = READING_WORDS[b.level as Level];
  issues.unique(
    b.keywords.map((k) => k.id),
    'keywords',
    'key-word ID',
  );
  issues.unique(
    b.keywords.map((k) => k.term),
    'keywords',
    'key-word term',
  );
  for (const locale of nativeLocales(b.lang))
    issues.unique(
      b.keywords.map((k) => k.translations[locale]?.[0] ?? ''),
      'keywords',
      `${locale} matching label (first translation)`,
    );
  const { main, exam } = b.documents;
  checkWords(
    main.targetWords,
    range.main,
    'documents.main.targetWords',
    'the main document',
    issues,
  );
  checkWords(
    exam.targetWords,
    range.exam,
    'documents.exam.targetWords',
    'the exam document',
    issues,
  );
  issues.unique(
    b.detailQuestions.map((q) => q.id),
    'detailQuestions',
    'question ID',
  );
  issues.unique(b.exam.types, 'exam.types', 'question type');
}

/* ================================================================= content */

type Question = Extract<ReadingItem, { type: 'reading_choice' | 'reading_true_false' }>;
const isQuestion = (item: ReadingItem): item is Question =>
  item.type === 'reading_choice' || item.type === 'reading_true_false';

/** A question's choices: unique ids and texts, and the answer is one of them. */
function checkOptions(
  item: { options: { optionId: string; text: string }[]; answerOptionId: string },
  path: string,
  issues: Issues,
) {
  issues.unique(
    item.options.map((o) => o.optionId),
    path,
    'option ID',
  );
  issues.unique(
    item.options.map((o) => o.text),
    path,
    'option text',
  );
  issues.check(
    item.options.some((o) => o.optionId === item.answerOptionId),
    path,
    'answerOptionId must be one of the options',
  );
}

/**
 * The document each stage shows, and how: the main document in the skim
 * view (a few seconds, then hidden), then open for the detail and
 * structure questions; the exam document on the exam page. The flashcards
 * and matching pages show no document.
 */
const VIEWS: Partial<
  Record<ReadingStage, { documentId: 'main' | 'exam'; view: 'skim' | 'open' | 'exam' }>
> = {
  skim: { documentId: 'main', view: 'skim' },
  detail: { documentId: 'main', view: 'open' },
  structure: { documentId: 'main', view: 'open' },
  exam: { documentId: 'exam', view: 'exam' },
};

/** The items of a stage's page (each stage has one page). */
const stageItems = (c: ReadingContent, stage: ReadingStage) =>
  c.steps[READING_STAGES.indexOf(stage)].pages[0].items;
/** The path of a stage's page: steps.3.pages.0 for detail. */
const stagePath = (stage: ReadingStage) => `steps.${READING_STAGES.indexOf(stage)}.pages.0`;

export function checkReadingContent(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  checkDocuments(c, b, issues);
  checkSteps(c, issues);
  // The pages can only be read once the documents and steps are right (and nothing else is wrong).
  if (issues.list.length) return;

  const keywordIds = b.keywords.map((k) => k.id);
  checkKeywordPages(c, keywordIds, issues);
  checkSkim(c, b, issues);
  checkDetail(c, b, issues);
  checkStructure(c, issues);
  checkExam(c, b, issues);
  checkPageTimes(c, issues);
  issues.check(
    b.estimatedMinutes === c.estimatedMinutes,
    'estimatedMinutes',
    `must equal the brief's ${b.estimatedMinutes} minutes`,
  );
}

/**
 * The documents: one main and one exam document, of the brief's genre,
 * with a word count in range. Highlights mark the key words in the main
 * document: each one is a key word found as a whole word, and every key
 * word is highlighted. The exam document has none.
 */
function checkDocuments(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  const range = READING_WORDS[c.level as Level];
  const keywordIds = b.keywords.map((k) => k.id);
  issues.check(c.genre === b.genre, 'genre', `must equal the brief genre ${b.genre}`);
  issues.check(
    sameSet(
      c.documents.map((d) => d.documentId),
      ['main', 'exam'],
    ),
    'documents',
    'one main and one exam document',
  );
  c.documents.forEach((doc, d) => {
    const path = `documents.${d}`;
    checkWords(
      documentWords(doc),
      range[doc.documentId],
      path,
      `the ${doc.documentId} document`,
      issues,
    );
    if (doc.documentId === 'exam')
      issues.check(
        doc.highlights.length === 0,
        `${path}.highlights`,
        'the exam document lists no highlights',
      );
    doc.highlights.forEach((h, i) => {
      issues.check(
        keywordIds.includes(h.keywordId),
        `${path}.highlights.${i}`,
        `unknown key word ${h.keywordId}`,
      );
      issues.check(
        doc.paragraphs.some((p) => highlightRanges(p, [h.text]).length > 0),
        `${path}.highlights.${i}`,
        `"${h.text}" is not in the document as a whole word`,
      );
    });
    if (doc.documentId === 'main')
      for (const id of keywordIds)
        issues.check(
          doc.highlights.some((h) => h.keywordId === id),
          `${path}.highlights`,
          `key word ${id} is never highlighted`,
        );
  });
}

/**
 * The six stages in order, each with its role. A stage that shows a
 * document (VIEWS) has it first on its page, in the right view; only the
 * skim view has skimSeconds. The others show no document.
 */
function checkSteps(c: ReadingContent, issues: Issues) {
  READING_STAGES.forEach((stage, si) => {
    const step = c.steps[si];
    if (
      !issues.check(step?.stage === stage, `steps.${si}.stage`, `expected the ${stage} step here`)
    )
      return;
    issues.check(
      step.role === (stage === 'exam' ? 'exam' : 'exercise'),
      `steps.${si}.role`,
      stage === 'exam'
        ? 'the exam step has the role exam'
        : 'practice steps have the role exercise',
    );
    const page = step.pages[0];
    const path = `steps.${si}.pages.0`;
    const want = VIEWS[stage];
    const docs = page.items.filter((it) => it.type === 'reading_document');
    if (!want) {
      issues.check(docs.length === 0, path, `the ${stage} page shows no document`);
      return;
    }
    const doc = page.items[0];
    if (
      !issues.check(
        docs.length === 1 && doc.type === 'reading_document',
        path,
        `the ${stage} page shows one document, first on the page`,
      ) ||
      doc.type !== 'reading_document'
    )
      return;
    issues.check(
      doc.documentId === want.documentId && doc.view === want.view,
      `${path}.items.0`,
      `the ${stage} page shows the ${want.documentId} document in the ${want.view} view`,
    );
    issues.check(
      (doc.view === 'skim') === (doc.skimSeconds !== null),
      `${path}.items.0.skimSeconds`,
      'only the skim view has skimSeconds',
    );
  });
}

/* =================================================================== pages */

/** Flashcards and matching: one item each, with every key word once. */
function checkKeywordPages(c: ReadingContent, keywordIds: string[], issues: Issues) {
  const [cards, ...moreCards] = stageItems(c, 'flashcards');
  issues.check(
    cards.type === 'reading_flashcards' &&
      !moreCards.length &&
      sameSet(cards.keywordIds, keywordIds),
    stagePath('flashcards'),
    'one reading_flashcards item with every key word once',
  );
  const [matching, ...moreMatching] = stageItems(c, 'matching');
  issues.check(
    matching.type === 'reading_keyword_matching' &&
      !moreMatching.length &&
      sameSet(matching.keywordIds, keywordIds),
    stagePath('matching'),
    'one reading_keyword_matching item with every key word once',
  );
}

/** Skim: after the document, one question about the brief's focus (genre, author or purpose). */
function checkSkim(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  const path = stagePath('skim');
  const questions = stageItems(c, 'skim').slice(1);
  const question = questions[0];
  if (
    !issues.check(
      questions.length === 1 && question.type === 'reading_skim_choice',
      path,
      'the skim page holds the document and one reading_skim_choice',
    ) ||
    question.type !== 'reading_skim_choice'
  )
    return;
  issues.check(
    question.focus === b.skim.focus,
    path,
    `the skim question asks about ${b.skim.focus}`,
  );
  checkOptions(question, `${path}.items.1`, issues);
}

/** Detail: after the document, the brief's questions in order, with their ids and types. */
function checkDetail(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  const path = stagePath('detail');
  const questions = stageItems(c, 'detail').slice(1);
  const planned = b.detailQuestions;
  issues.check(
    questions.length === planned.length &&
      questions.every((q, i) => q.itemId === planned[i].id && q.type === planned[i].type),
    path,
    `expected the brief's questions in order: ${planned.map((q) => `${q.id} (${q.type})`).join(', ')}`,
  );
  questions.forEach(
    (q, i) => q.type === 'reading_choice' && checkOptions(q, `${path}.items.${i + 1}`, issues),
  );
}

/** Structure: after the document, one task to put pieces in order; each accepted order uses every piece once. */
function checkStructure(c: ReadingContent, issues: Issues) {
  const path = stagePath('structure');
  const tasks = stageItems(c, 'structure').slice(1);
  const task = tasks[0];
  if (
    !issues.check(
      tasks.length === 1 && task.type === 'reading_order',
      path,
      'the structure page holds the document and one reading_order',
    ) ||
    task.type !== 'reading_order'
  )
    return;
  const pieceIds = task.pieces.map((p) => p.pieceId);
  issues.unique(pieceIds, path, 'piece ID');
  issues.unique(
    task.pieces.map((p) => p.text),
    path,
    'piece text',
  );
  for (const order of task.acceptedOrders)
    issues.check(
      sameSet(order, pieceIds),
      path,
      'each accepted order uses every piece exactly once',
    );
}

/**
 * The exam: after the exam document, five questions of the planned
 * types. It tests a new document: no question of the skim or detail page
 * again (ignoring case and punctuation), and no paragraph of the main
 * document in the exam one.
 */
function checkExam(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  const path = stagePath('exam');
  const questions = stageItems(c, 'exam').slice(1);
  issues.check(
    questions.length === READING_LIMITS.examQuestions &&
      questions.every((q) => isQuestion(q) && b.exam.types.includes(q.type)),
    path,
    `the exam page holds the document and ${READING_LIMITS.examQuestions} questions of type ${b.exam.types.join(' / ')}`,
  );
  questions.forEach(
    (q, i) => q.type === 'reading_choice' && checkOptions(q, `${path}.items.${i + 1}`, issues),
  );

  const asked = (q: ReadingItem) =>
    q.type === 'reading_true_false' ? q.statement : 'question' in q ? q.question : undefined;
  const key = (text: string) =>
    text
      .toLocaleLowerCase('fr')
      .replace(/[\s.?!…]+/gu, ' ')
      .trim();
  const practice = new Set(
    [...stageItems(c, 'skim').slice(1), ...stageItems(c, 'detail').slice(1)]
      .map(asked)
      .filter((t) => t !== undefined)
      .map(key),
  );
  questions.forEach((q, i) => {
    const text = asked(q);
    issues.check(
      text === undefined || !practice.has(key(text)),
      `${path}.items.${i + 1}`,
      'repeats a skim or detail question',
    );
  });

  const documents = new Map(c.documents.map((d) => [d.documentId, d]));
  const main = documents.get('main')?.paragraphs ?? [];
  issues.check(
    !(documents.get('exam')?.paragraphs ?? []).some((p) => main.includes(p)),
    'documents',
    'the exam document repeats a paragraph of the main document',
  );
}

/** Page durations follow the page rules; only the exam page has a countdown, 1.5 × its duration. */
function checkPageTimes(c: ReadingContent, issues: Issues) {
  const documents = new Map(c.documents.map((d) => [d.documentId, d]));
  c.steps.forEach((step, si) => {
    const page = step.pages[0];
    const exam = step.stage === 'exam';
    const estimate = readingPageEstimate(page.items, documents, c.level as Level, exam);
    issues.check(
      page.estimatedDurationS === estimate,
      `steps.${si}.pages.0.estimatedDurationS`,
      `must be ${estimate} s by READING_PAGE_RULES`,
    );
    const limit = exam ? readingTimeLimit(estimate) : null;
    issues.check(
      page.timeLimitS === limit,
      `steps.${si}.pages.0.timeLimitS`,
      limit === null
        ? 'only the exam page has a countdown limit'
        : `must be ${limit} s (1.5 × estimate, rounded up to 5 s)`,
    );
  });
}
