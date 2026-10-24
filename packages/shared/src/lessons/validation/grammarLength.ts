import {
  GRAMMAR_LENGTH as L,
  type GrammarBrief,
  type GrammarContent,
  type GrammarItem,
} from '../schemas/grammar';
import { Issues, type Issue } from './issues';

/**
 * How long a grammar lesson must be (GRAMMAR_LENGTH in
 * ../schemas/grammar.ts): enough exercises, enough answers to grade, and
 * pages that take a sensible time.
 *
 * These checks are not part of validateBrief and validateContent: a
 * short lesson is still a correct one. validateLesson adds them, so a
 * lesson that is too short does not reach the database. Each function
 * returns its own list of issues.
 *
 * A "scored unit" is one graded answer: one item, or one row of an item
 * made of rows (a person matching board of 6 rows is 6 units).
 */

/** The scored units of an item: one per row for an item with rows, none for an explanation or the feedback placeholder, else one. */
const unitCount = (item: GrammarItem) =>
  'rows' in item
    ? item.rows.length
    : item.type === 'grammar_explanation' || item.type === 'production_feedback_placeholder'
      ? 0
      : 1;

/**
 * The brief plans enough: 2 to 4 exercises per block (the schema already
 * caps it at 4), 2 to 4 exam pages, and enough planned units. The brief
 * only gives an itemCount per exercise, so an exercise with rows is
 * counted as 3 units per item.
 */
export function grammarBriefLengthIssues(b: GrammarBrief): Issue[] {
  const issues = new Issues();
  b.blocks.forEach((block, i) =>
    issues.check(
      block.exercises.length >= L.exercisesPerBlock[0],
      `blocks.${i}.exercises`,
      `a teaching block has ${L.exercisesPerBlock[0]}–${L.exercisesPerBlock[1]} exercises (P3-07)`,
    ),
  );
  issues.check(
    b.exam.pages.length >= L.examPages[0] && b.exam.pages.length <= L.examPages[1],
    'exam.pages',
    `the exam has ${L.examPages[0]}–${L.examPages[1]} pages (P3-07)`,
  );

  const planned = (p: { type: string; itemCount: number }) =>
    /pronoun|person/.test(p.type) ? 3 * p.itemCount : p.itemCount;
  const practice = b.blocks.flatMap((x) => x.exercises).reduce((n, e) => n + planned(e), 0);
  const exam = b.exam.pages.reduce((n, p) => n + planned(p), 0);
  issues.check(
    practice >= L.minPracticeUnits,
    'blocks',
    `the exercises plan about ${practice} scored units; at least ${L.minPracticeUnits} (P3-07)`,
  );
  issues.check(
    exam >= L.minExamUnits,
    'exam.pages',
    `the exam plans about ${exam} scored units; at least ${L.minExamUnits} (P3-07)`,
  );
  return issues.list;
}

/**
 * The content has enough units, counted for real this time, and each
 * page takes a sensible time: 45 to 240 s for an explanation page, 6 to
 * 40 s per unit for any other page with units.
 */
export function grammarContentLengthIssues(c: GrammarContent): Issue[] {
  const issues = new Issues();
  const units = (role: 'exercise' | 'exam') =>
    c.steps
      .filter((s) => s.role === role)
      .flatMap((s) => s.pages.flatMap((pg) => pg.items))
      .reduce((n, it) => n + unitCount(it), 0);
  const practice = units('exercise');
  const exam = units('exam');
  issues.check(
    practice >= L.minPracticeUnits,
    'steps',
    `practice has ${practice} scored units; at least ${L.minPracticeUnits} (P3-07)`,
  );
  issues.check(
    exam >= L.minExamUnits,
    'steps',
    `the exam has ${exam} scored units; at least ${L.minExamUnits} (P3-07)`,
  );

  c.steps.forEach((step, si) =>
    step.pages.forEach((pg, pi) => {
      const path = `steps.${si}.pages.${pi}.estimatedDurationS`;
      const n = pg.items.reduce((total, it) => total + unitCount(it), 0);
      if (step.role === 'explanation') {
        const [min, max] = L.explanationSeconds;
        issues.check(
          pg.estimatedDurationS >= min && pg.estimatedDurationS <= max,
          path,
          `an explanation page takes ${min}–${max} s`,
        );
      } else if (n > 0) {
        const [min, max] = L.secondsPerUnit;
        const per = pg.estimatedDurationS / n;
        issues.check(
          per >= min && per <= max,
          path,
          `${Math.round(per)} s per scored unit; keep ${min}–${max} s (P3-07)`,
        );
      }
    }),
  );
  return issues.list;
}
