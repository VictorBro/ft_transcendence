import { nativeLocales } from '../schemas/artifactCommon';
import type { Level } from '../../schemas/item';
import {
  READING_LIMITS,
  READING_STAGES,
  READING_WORDS,
  type ReadingBrief,
  type ReadingContent,
  type ReadingItem,
} from '../schemas/reading';
import {
  documentWords,
  highlightRanges,
  readingPageEstimate,
  readingTimeLimit,
} from '../domain/readingLesson';
import type { Issues } from './artifacts';

/**
 * Reading checks beyond the schemas (SPEC section 9, "Validation"): key words, word counts per level,
 * highlights, the six steps with their document views, the planned questions, options, piece orders,
 * the exam page and the page rules. A failure makes the file invalid.
 */

/** Same members with the same multiplicity, in any order. */
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

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
  checkWords(
    b.documents.main.targetWords,
    range.main,
    'documents.main.targetWords',
    'the main document',
    issues,
  );
  checkWords(
    b.documents.exam.targetWords,
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

type Question = Extract<ReadingItem, { type: 'reading_choice' | 'reading_true_false' }>;
const isQuestion = (item: ReadingItem): item is Question =>
  item.type === 'reading_choice' || item.type === 'reading_true_false';

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

/** Document view of each step: the main document open after the skim, the exam document on the exam page. */
const VIEWS: Partial<
  Record<
    (typeof READING_STAGES)[number],
    { documentId: 'main' | 'exam'; view: 'skim' | 'open' | 'exam' }
  >
> = {
  skim: { documentId: 'main', view: 'skim' },
  detail: { documentId: 'main', view: 'open' },
  structure: { documentId: 'main', view: 'open' },
  exam: { documentId: 'exam', view: 'exam' },
};

/** The lesson follows its brief and the page rules (section 9). */
export function checkReadingContent(c: ReadingContent, b: ReadingBrief, issues: Issues) {
  const level = c.level as Level;
  const range = READING_WORDS[level];
  const keywordIds = b.keywords.map((k) => k.id);
  const documents = new Map(c.documents.map((d) => [d.documentId, d]));

  // Documents: one of each, the brief's genre, word counts in range, highlights in the main document only.
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

  // Steps in order, each one page; the document first on its page, in the view of its stage.
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
      issues.check(
        docs.length === 1 && doc.type === 'reading_document',
        path,
        `the ${stage} page shows one document, first on the page`,
      ) &&
      doc.type === 'reading_document'
    ) {
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
    }
  });
  if (issues.list.length) return;

  const items = (stage: (typeof READING_STAGES)[number]) =>
    c.steps[READING_STAGES.indexOf(stage)].pages[0].items;
  const path = (stage: (typeof READING_STAGES)[number]) =>
    `steps.${READING_STAGES.indexOf(stage)}.pages.0`;

  // Flashcards and matching cover every key word.
  const [cards, ...moreCards] = items('flashcards');
  issues.check(
    cards.type === 'reading_flashcards' &&
      !moreCards.length &&
      sameSet(cards.keywordIds, keywordIds),
    path('flashcards'),
    'one reading_flashcards item with every key word once',
  );
  const [matching, ...moreMatching] = items('matching');
  issues.check(
    matching.type === 'reading_keyword_matching' &&
      !moreMatching.length &&
      sameSet(matching.keywordIds, keywordIds),
    path('matching'),
    'one reading_keyword_matching item with every key word once',
  );

  // Skim: the document, then one question with the brief's focus.
  const skim = items('skim').slice(1);
  const question = skim[0];
  if (
    issues.check(
      skim.length === 1 && question.type === 'reading_skim_choice',
      path('skim'),
      'the skim page holds the document and one reading_skim_choice',
    ) &&
    question.type === 'reading_skim_choice'
  ) {
    issues.check(
      question.focus === b.skim.focus,
      path('skim'),
      `the skim question asks about ${b.skim.focus}`,
    );
    checkOptions(question, `${path('skim')}.items.1`, issues);
  }

  // Detail: the planned questions in order, with their IDs and types.
  const detail = items('detail').slice(1);
  const planned = b.detailQuestions;
  issues.check(
    detail.length === planned.length &&
      detail.every((q, i) => q.itemId === planned[i].id && q.type === planned[i].type),
    path('detail'),
    `expected the brief's questions in order: ${planned.map((q) => `${q.id} (${q.type})`).join(', ')}`,
  );
  detail.forEach(
    (q, i) =>
      q.type === 'reading_choice' && checkOptions(q, `${path('detail')}.items.${i + 1}`, issues),
  );

  // Structure: one ordering task whose accepted orders use every piece once.
  const structure = items('structure').slice(1);
  const task = structure[0];
  if (
    issues.check(
      structure.length === 1 && task.type === 'reading_order',
      path('structure'),
      'the structure page holds the document and one reading_order',
    ) &&
    task.type === 'reading_order'
  ) {
    const pieceIds = task.pieces.map((p) => p.pieceId);
    issues.unique(pieceIds, path('structure'), 'piece ID');
    issues.unique(
      task.pieces.map((p) => p.text),
      path('structure'),
      'piece text',
    );
    for (const order of task.acceptedOrders)
      issues.check(
        sameSet(order, pieceIds),
        path('structure'),
        'each accepted order uses every piece exactly once',
      );
  }

  // Exam: five questions of the planned types.
  const exam = items('exam').slice(1);
  issues.check(
    exam.length === READING_LIMITS.examQuestions &&
      exam.every((q) => isQuestion(q) && b.exam.types.includes(q.type)),
    path('exam'),
    `the exam page holds the document and ${READING_LIMITS.examQuestions} questions of type ${b.exam.types.join(' / ')}`,
  );
  exam.forEach(
    (q, i) =>
      q.type === 'reading_choice' && checkOptions(q, `${path('exam')}.items.${i + 1}`, issues),
  );
  // The exam tests a second document (P5-05): no question of the skim or detail page again, no paragraph of the main document.
  const asked = (q: ReadingItem) =>
    q.type === 'reading_true_false' ? q.statement : 'question' in q ? q.question : undefined;
  const key = (text: string) =>
    text
      .toLocaleLowerCase('fr')
      .replace(/[\s.?!…]+/gu, ' ')
      .trim();
  const practice = new Set(
    [...skim, ...detail]
      .map(asked)
      .filter((t) => t !== undefined)
      .map(key),
  );
  exam.forEach((q, i) => {
    const text = asked(q);
    issues.check(
      text === undefined || !practice.has(key(text)),
      `${path('exam')}.items.${i + 1}`,
      'repeats a skim or detail question',
    );
  });
  const main = documents.get('main')?.paragraphs ?? [];
  issues.check(
    !(documents.get('exam')?.paragraphs ?? []).some((p) => main.includes(p)),
    'documents',
    'the exam document repeats a paragraph of the main document',
  );

  // Page estimates and the exam limit follow the page rules; only the exam page has a countdown.
  c.steps.forEach((step, si) => {
    const page = step.pages[0];
    const estimate = readingPageEstimate(page.items, documents, level, step.stage === 'exam');
    issues.check(
      page.estimatedDurationS === estimate,
      `steps.${si}.pages.0.estimatedDurationS`,
      `must be ${estimate} s by the page rules (section 9)`,
    );
    const limit = step.stage === 'exam' ? readingTimeLimit(estimate) : null;
    issues.check(
      page.timeLimitS === limit,
      `steps.${si}.pages.0.timeLimitS`,
      limit === null
        ? 'only the exam page has a countdown limit'
        : `must be ${limit} s (1.5 × estimate, rounded up to 5 s)`,
    );
  });
  issues.check(
    b.estimatedMinutes === c.estimatedMinutes,
    'estimatedMinutes',
    `must equal the brief's ${b.estimatedMinutes} minutes`,
  );
}
