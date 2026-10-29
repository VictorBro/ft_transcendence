import { describe, expect, it } from 'vitest';

import { GRACE_MS, results, start, submit, view, type AttemptState } from './attempt';
import {
  BY_KIND,
  FIXTURE_LESSONS,
  fixtureLesson,
  pageAnswers,
  refOf,
  type FixtureLesson,
} from './fixtures.testing';
import { buildPlan, type LessonPlan, type PlanUnit } from './plan';
import { paths } from './redact';
import { AttemptViewSchema, PageResultSchema, ResultsSchema, type Answer } from './view';

const ID = '6f1c2b8e-3d4a-4e5f-9a6b-7c8d9e0f1a2b';
const ref = refOf('secret');
const finish = { countedToday: true, doneCount: 1, target: 3, goalJustMet: false, best: 50 };

/** Submits the cursor page; throws when refused. */
function next(
  plan: LessonPlan,
  state: AttemptState,
  now: number,
  answers: Record<string, Answer> = pageAnswers(plan.pages[state.page], ref),
) {
  const result = submit(plan, state, state.page, answers, now, ref);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Goes from page 0 up to the first exam page, every answer right. */
function toExam(plan: LessonPlan, now = 0) {
  let state = start(plan, now);
  while (plan.pages[state.page].role !== 'exam') state = next(plan, state, now).state;
  return state;
}

/** Plays a whole lesson; `how` answers each unit. */
function play(
  plan: LessonPlan,
  how: (unit: PlanUnit) => 'right' | 'slip' | 'wrong' | 'blank',
): AttemptState {
  let state = start(plan, 0);
  for (let guard = 0; state.completedAt === null && guard < 200; guard++)
    state = next(plan, state, 0, pageAnswers(plan.pages[state.page], ref, how)).state;
  return state;
}

describe('submit', () => {
  const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');

  it('scores and locks every unit of a practice page, a blank as 0, and returns its feedback', () => {
    let state = start(plan, 0);
    state = next(plan, state, 0).state; // introduction
    state = next(plan, state, 0).state; // flashcards
    const page = plan.pages[state.page];
    expect(page.pageId).toBe('match-1');
    const [first, ...others] = page.units;
    const answers = pageAnswers(page, ref, (u) => (u === first ? 'blank' : 'right'));
    const result = next(plan, state, 0, answers);
    expect(
      PageResultSchema.parse({
        feedback: result.feedback,
        attempt: view(plan, result.state, ID, ref, 0),
      }),
    ).toBeTruthy();
    expect(result.feedback?.map((f) => [f.outcome, f.points])).toEqual([
      ['unanswered', 0],
      ...others.map(() => ['fully_correct', 1]),
    ]);
    expect(result.feedback?.[0]).toMatchObject({
      ref: ref(first.id),
      answer: first.answer,
      scored: true,
    });
    expect(result.feedback?.[0].correct).toHaveLength(1);
    expect(result.state.answers[first.id]).toMatchObject({ response: null, outcome: 'unanswered' });
    expect(result.state.page).toBe(state.page + 1);
    // The header counts the practice points so far.
    expect(view(plan, result.state, ID, ref, 0).practice).toEqual({ earned: 3, possible: 12 });
  });

  it('refuses another index, a replay and a finished attempt; a locked unit never changes', () => {
    const state = start(plan, 0);
    expect(submit(plan, state, 1, {}, 0, ref)).toEqual({ ok: false, error: 'stale' });
    const after = next(plan, state, 0).state;
    expect(submit(plan, after, 0, {}, 0, ref)).toEqual({ ok: false, error: 'stale' });
    const done = play(plan, () => 'right');
    const last = plan.pages.length - 1;
    expect(submit(plan, done, last, {}, 0, ref)).toEqual({ ok: false, error: 'stale' });
    // A unit already locked keeps its answer, whatever comes again.
    const page = plan.pages[2];
    const locked = {
      ...after,
      page: 2,
      answers: {
        [page.units[0].id]: {
          response: null,
          outcome: 'unanswered' as const,
          points: 0 as const,
          timedOut: false,
        },
      },
    };
    const again = next(plan, locked, 0, pageAnswers(page, ref));
    expect(again.state.answers[page.units[0].id].points).toBe(0);
  });

  it('refuses an unknown ref, a ref of another attempt and an answer of the wrong kind', () => {
    let state = start(plan, 0);
    expect(submit(plan, state, 0, { [ref('nothing')]: { text: 'x' } }, 0, ref)).toEqual({
      ok: false,
      error: 'invalidAnswer',
    });
    while (plan.pages[state.page].pageId !== 'match-1') state = next(plan, state, 0).state;
    const page = plan.pages[state.page];
    const unit = page.units[0];
    const other = refOf('another secret');
    const invalid = (answer: Answer, key = ref(unit.id)) =>
      submit(plan, state, state.page, { [key]: answer }, 0, ref);
    expect(invalid({ text: 'livre' })).toEqual({ ok: false, error: 'invalidAnswer' });
    expect(invalid({ option: other(paths.option(page, unit.itemId, 'livre')) })).toEqual({
      ok: false,
      error: 'invalidAnswer',
    });
    expect(
      invalid({ option: ref(paths.option(page, unit.itemId, 'livre')) }, other(unit.id)),
    ).toEqual({ ok: false, error: 'invalidAnswer' });
    expect(invalid({ option: ref(paths.option(page, unit.itemId, 'livre')) }).ok).toBe(true);
  });

  it('times an exam page: on time and inside the grace it is graded, after it every unit is blank and Out of time', () => {
    const exam = toExam(plan, 1000);
    const page = plan.pages[exam.page];
    expect(exam.deadline).toBe(1000 + page.timeLimitS! * 1000);
    expect(view(plan, exam, ID, ref, 1000).remainingMs).toBe(page.timeLimitS! * 1000);
    expect(view(plan, exam, ID, ref, exam.deadline! + 5000).remainingMs).toBe(0);

    const onTime = next(plan, exam, exam.deadline! - 1);
    const inGrace = next(plan, exam, exam.deadline! + GRACE_MS);
    const late = next(plan, exam, exam.deadline! + GRACE_MS + 1);
    for (const u of page.units) {
      expect(onTime.state.answers[u.id]).toMatchObject({
        outcome: 'fully_correct',
        timedOut: false,
      });
      expect(inGrace.state.answers[u.id]).toMatchObject({
        outcome: 'fully_correct',
        timedOut: false,
      });
      expect(late.state.answers[u.id]).toEqual({
        response: null,
        outcome: 'unanswered',
        points: 0,
        timedOut: true,
      });
    }
    // An exam page has no feedback.
    expect(onTime.feedback).toBeNull();

    // A late page locks Out of time even with an answer it cannot read; on time, that is refused.
    const unreadable = { [ref('nothing')]: { text: 'x' } };
    expect(submit(plan, exam, exam.page, unreadable, exam.deadline! - 1, ref)).toEqual({
      ok: false,
      error: 'invalidAnswer',
    });
    const lateUnreadable = next(plan, exam, exam.deadline! + GRACE_MS + 1, unreadable);
    for (const u of page.units) expect(lateUnreadable.state.answers[u.id].timedOut).toBe(true);
  });

  it('gives the next exam page its own deadline, from when the cursor reaches it', () => {
    const grammar = buildPlan(fixtureLesson(BY_KIND.grammar), 'en');
    const exam = toExam(grammar, 0);
    const second = next(grammar, exam, 30_000).state;
    expect(grammar.pages[second.page].role).toBe('exam');
    expect(second.deadline).toBe(30_000 + grammar.pages[second.page].timeLimitS! * 1000);
  });

  it('closes the attempt on the last page', () => {
    let state = toExam(plan, 0);
    let result = next(plan, state, 0);
    expect(result.closed).toBe(true);
    state = result.state;
    expect(state).toMatchObject({ completedAt: 0, deadline: null });
    const v = view(plan, state, ID, ref, 0, { ...results(plan, state), finish });
    expect(AttemptViewSchema.parse(v)).toMatchObject({ current: null, remainingMs: null });
    expect(v.results?.score).toBe(100);
    result = submit(plan, state, state.page, {}, 0, ref) as typeof result;
    expect(result).toEqual({ ok: false, error: 'stale' });
  });
});

describe('results', () => {
  it('lists every unit with yours, the answer, points, marks and the explanation in en, fr and de', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    const state = play(plan, (u) =>
      u.itemType === 'vocabulary_translation_exam' ? 'slip' : 'right',
    );
    const sheet = ResultsSchema.parse({ ...results(plan, state), finish });
    expect(sheet.practice).toEqual({ earned: 12, possible: 12 });
    expect(sheet.exam).toEqual({ earned: 2, possible: 4 });
    expect(sheet.score).toBe(67.5);
    expect(sheet.steps.map((s) => [s.title.en, s.role, s.earned, s.possible])).toEqual([
      ['Matching', 'practice', 4, 4],
      ['Gender', 'practice', 4, 4],
      ['Practice', 'practice', 4, 4],
      ['Final exam', 'exam', 2, 4],
    ]);
    const row = sheet.rows.at(-1)!;
    expect(row).toMatchObject({
      step: 3,
      outcome: 'orthography_only',
      points: 0.5,
      timedOut: false,
    });
    expect(row.yours).toBe(row.answer.toUpperCase());
    expect(row.marks?.some((m) => m.wrong)).toBe(true);
    expect(Object.keys(row.explanation)).toEqual(['en', 'fr', 'de']);
    // A choice shows the option chosen.
    expect(sheet.rows[0].yours).toBe(sheet.rows[0].answer);
  });

  it('gives an exam that ran out its Out of time rows', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    let state = toExam(plan, 0);
    state = next(plan, state, state.deadline! + GRACE_MS + 1).state;
    const sheet = results(plan, state);
    const exam = sheet.rows.filter((r) => sheet.steps[r.step].role === 'exam');
    expect(exam.every((r) => r.timedOut && r.yours === null && r.points === 0)).toBe(true);
    expect(sheet.score).toBe(35);
  });

  it('names the parts of a split exam', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.functions), 'en');
    const sheet = results(
      plan,
      play(plan, () => 'right'),
    );
    expect(sheet.steps.filter((s) => s.role === 'exam').map((s) => [s.part, s.title.de])).toEqual([
      ['translation', 'Übersetzung'],
      ['replies', 'Antworten'],
      ['dialogue', 'Dialog'],
    ]);
    expect(sheet.score).toBe(100);
  });

  /**
   * One scripted answer set, keyed by unit id: a third of the units wrong,
   * a third with a spelling slip (an option or an order is then right),
   * a third right. The expected scores are what the prototype gives for
   * the same lessons and the same answers (c806f47's sessionReducer and
   * lessonResults, its vocabulary listening pages skipped as without a
   * voice, which leaves them out of the score as the player does).
   */
  const PROTOTYPE: Record<FixtureLesson, number> = {
    'fr-classroom-objects': 54.375,
    'fr-verb-etre-present': 52.33333333333333,
    'fr-negation-ne-pas': 50,
    'fr-ordering-at-a-cafe': 59.79166666666667,
    'fr-greetings-and-goodbyes': 42.5,
    'fr-reading-a-text-message': 77.45454545454545,
  };
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const scripted = (u: PlanUnit) => (['wrong', 'right', 'slip'] as const)[hash(u.id) % 3];

  it.each(FIXTURE_LESSONS)('gives the prototype’s score for a scripted answer set: %s', (id) => {
    const plan = buildPlan(fixtureLesson(id), 'en');
    const sheet = results(plan, play(plan, scripted));
    expect(sheet.score).toBe(Math.round(PROTOTYPE[id] * 10) / 10);
  });
});
