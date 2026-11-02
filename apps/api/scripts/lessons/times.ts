/**
 * Every duration the validators recompute to the second (#83). The model
 * never writes them: they come from the formulas in @ft/shared, so a
 * completed lesson always agrees with its validator.
 *
 *   kind        the model chooses                     computed here
 *   vocabulary  nothing                               targetCount, estimatedMinutes
 *   grammar     every estimatedDurationS, the exam    estimatedMinutes (both files),
 *               time limits in the brief              the content pages' timeLimitS
 *   functions   nothing                               every page's duration and limit,
 *                                                     estimatedMinutes (both files)
 *   reading     nothing                               the same, plus every skimSeconds
 *
 * Each function works on the raw files, which have not passed a schema
 * yet: a part too broken to compute is left as drafted, and validateLesson
 * reports it.
 */
import { lessons, type Level } from '@ft/shared';

import { isObject, type Json } from './json';

/** Seconds to whole minutes, never below 1: what estimatedMinutes holds. */
const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** Adds the finite numbers and skips the rest (a missing duration counts 0). */
const sum = (xs: unknown[]) =>
  xs.reduce<number>((total, x) => total + (typeof x === 'number' && Number.isFinite(x) ? x : 0), 0);

/** The pages of every step, flattened: [steps[0].pages…, steps[1].pages…]. */
export const pagesOf = (file: Json): Json[] =>
  Array.isArray(file?.steps)
    ? file.steps.flatMap((s: Json) => (Array.isArray(s?.pages) ? s.pages : []))
    : [];

/** Each page with its stage: an exam page has a time limit, a practice page none. */
function* pagesWithStage(content: Json, isExam: (step: Json) => boolean) {
  for (const step of Array.isArray(content?.steps) ? content.steps : [])
    for (const page of Array.isArray(step?.pages) ? step.pages : [])
      if (isObject(page)) yield { page, exam: isExam(step) };
}

/** Vocabulary: the app builds the lesson from the brief, so its length comes from that build. */
function vocabularyTimes(brief: Json) {
  if (Array.isArray(brief.targets)) brief.targetCount = brief.targets.length;
  try {
    brief.estimatedMinutes = lessons.vocabularyMinutes(lessons.vocabularyLesson(brief).steps);
  } catch {
    // The builder needs a sound brief; validateLesson reports a broken one.
  }
}

/**
 * Grammar: the model picks each duration (within GRAMMAR_LENGTH). Only the
 * totals follow, and each exam page of the content takes the time limit the
 * brief's exam plan gives its pageId.
 */
function grammarTimes(brief: Json, content: Json | undefined) {
  if (Array.isArray(brief.blocks) && Array.isArray(brief.exam?.pages)) {
    const blocks = brief.blocks.map(
      (b: Json) =>
        sum([b?.explanationDurationS]) +
        sum(
          (Array.isArray(b?.exercises) ? b.exercises : []).map((e: Json) => e?.estimatedDurationS),
        ),
    );
    const exam = brief.exam.pages.map((p: Json) => p?.estimatedDurationS);
    brief.estimatedMinutes = minutes(
      sum(blocks) + sum([brief.feedbackPlaceholder?.estimatedDurationS]) + sum(exam),
    );
  }
  if (!content) return;
  const limits = new Map<unknown, unknown>(
    (Array.isArray(brief.exam?.pages) ? brief.exam.pages : []).map((p: Json) => [
      p?.pageId,
      p?.timeLimitS,
    ]),
  );
  for (const { page, exam } of pagesWithStage(content, (s) => s?.role === 'exam'))
    page.timeLimitS = exam ? (limits.get(page.pageId) ?? null) : null;
  content.estimatedMinutes = minutes(sum(pagesOf(content).map((p) => p?.estimatedDurationS)));
}

/** Functions: each page's duration comes from its items, its limit from its duration. */
function functionsTimes(brief: Json, content: Json | undefined) {
  if (!content) return;
  for (const { page, exam } of pagesWithStage(content, (s) => s?.stage === 'exam')) {
    if (!Array.isArray(page.items)) continue;
    try {
      page.estimatedDurationS = lessons.functionsPageEstimate(page.items, exam);
      page.timeLimitS = exam ? lessons.functionsTimeLimit(page.estimatedDurationS) : null;
    } catch {
      // Left as drafted: validateLesson reports the broken items.
    }
  }
  content.estimatedMinutes = minutes(sum(pagesOf(content).map((p) => p?.estimatedDurationS)));
  brief.estimatedMinutes = content.estimatedMinutes;
}

/**
 * Reading: like functions, but a page's duration also depends on the
 * documents it shows, and a skim view gets the seconds the main document
 * takes to skim at this level.
 */
function readingTimes(brief: Json, content: Json | undefined, level: Level) {
  if (!content || !Array.isArray(content.documents)) return;
  const documents = new Map<string, Json>(content.documents.map((d: Json) => [d?.documentId, d]));
  const main = documents.get('main');
  for (const { page, exam } of pagesWithStage(content, (s) => s?.stage === 'exam')) {
    if (!Array.isArray(page.items)) continue;
    try {
      for (const item of page.items)
        if (item?.type === 'reading_document')
          item.skimSeconds =
            item.view === 'skim' && main ? lessons.readingSkimSeconds(main, level) : null;
      page.estimatedDurationS = lessons.readingPageEstimate(page.items, documents, level, exam);
      page.timeLimitS = exam ? lessons.readingTimeLimit(page.estimatedDurationS) : null;
    } catch {
      // Left as drafted: validateLesson reports the broken items.
    }
  }
  content.estimatedMinutes = lessons.readingMinutes(
    pagesOf(content).map((p) => p?.estimatedDurationS ?? 0),
  );
  brief.estimatedMinutes = content.estimatedMinutes;
}

/** Writes every computed number into `brief` and `content`, in place. */
export function computeTimes(
  kind: string,
  brief: Json,
  content: Json | undefined,
  level: Level,
): void {
  if (kind === 'vocabulary') vocabularyTimes(brief);
  else if (kind === 'grammar') grammarTimes(brief, content);
  else if (kind === 'functions') functionsTimes(brief, content);
  else if (kind === 'reading') readingTimes(brief, content, level);
}
