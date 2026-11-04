import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type TestAgent from 'supertest/lib/agent';

import { lessons, type Language, type Level } from '@ft/shared';

import type { Prisma } from '../src/generated/prisma/client';
import { refOf } from '../src/lessons/attempt-ref';
import type { PrismaService } from '../src/prisma/prisma.service';

type Answer = lessons.player.Answer;
type PlanPage = lessons.player.PlanPage;
type PlanUnit = lessons.player.PlanUnit;
type RefOf = lessons.player.RefOf;

/** PR #142's short vocabulary lesson: 11 pages, 16 units, an 80 s exam page last. */
const SHORT_BRIEF = join(
  __dirname,
  '../../../packages/shared/test/fixtures/content/briefs/fr-classroom-objects.json',
);

/**
 * A ready lesson row on the short lesson's brief, under another id. Its
 * brief stays French: for a `de-` or B1 fixture it only stands in, the
 * attempt plays it the same.
 */
export function shortLesson(
  id: string,
  position: number,
  level: Level = 'A1',
  lang: Language = 'fr',
): Prisma.LessonCreateManyInput {
  const brief = JSON.parse(readFileSync(SHORT_BRIEF, 'utf8')) as { title: string };
  return {
    id,
    lang,
    level,
    position,
    kind: 'vocabulary',
    topic: null,
    theme: 'education',
    title: brief.title,
    summary: 'Une leçon de test.',
    brief: { ...brief, id },
    ready: true,
  };
}

/** A right answer to a unit, as the browser sends it: refs instead of ids. */
function rightAnswer(page: PlanPage, unit: PlanUnit, ref: RefOf): Answer {
  const { paths } = lessons.player;
  switch (unit.kind) {
    case 'text':
      return { text: unit.accepted.answers[0] };
    case 'choice':
      return { option: ref(paths.option(page, unit.itemId, unit.correct[0])) };
    case 'order':
      return { tokens: unit.acceptedOrders[0].map((t) => ref(paths.token(page, unit.itemId, t))) };
    case 'spot':
      return {
        token: ref(paths.token(page, unit.itemId, unit.faultyTokenId)),
        text: unit.correction.accepted.answers[0],
      };
  }
}

/**
 * Starts a lesson and submits every page but the last, as the browser
 * would: every unit right, or every unit blank. Returns the request of the
 * last page, unsent, so a test can time it. The test rebuilds the plan and
 * the refs from the rows, which the browser never can.
 */
export async function playToLast(
  agent: TestAgent,
  prisma: PrismaService,
  lang: Language,
  id: string,
  how: 'right' | 'blank' = 'right',
) {
  const url = `/api/courses/${lang}/lessons/${id}/attempt`;
  const { attemptId } = (await agent.post(url).send({ locale: 'en' }).expect(201)).body;
  const row = await prisma.lessonAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { lesson: { select: { brief: true, content: true } } },
  });
  const source = row.lesson as unknown as lessons.player.LessonSource;
  const plan = lessons.player.buildPlan(source, row.motherTongue);
  const ref = refOf(row.secret);

  const answers = (page: PlanPage) =>
    how === 'blank'
      ? {}
      : Object.fromEntries(
          page.units.map((unit) => [
            ref(lessons.player.paths.unit(unit)),
            rightAnswer(page, unit, ref),
          ]),
        );
  const submit = (index: number) =>
    agent.post(`${url}/pages/${index}`).send({ attemptId, answers: answers(plan.pages[index]) });

  const last = plan.pages.length - 1;
  for (let index = 0; index < last; index++) {
    await submit(index).expect(200);
  }
  return () => submit(last);
}

/** Plays a whole lesson to its results (every unit right, or blank), and returns them. */
export async function playLesson(
  agent: TestAgent,
  prisma: PrismaService,
  lang: Language,
  id: string,
  how: 'right' | 'blank' = 'right',
): Promise<lessons.player.Results> {
  const last = await playToLast(agent, prisma, lang, id, how);
  return (await last().expect(200)).body.attempt.results;
}
