import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEVELS,
  PlacementQuestionSchema,
  QUESTION_CATEGORIES,
  type PlacementQuestion,
  type PlacementResult,
} from '@ft/shared';

import type { CoursesService } from '../courses/courses.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PlacementService } from './placement.service';
import type { PlacementStore, Run } from './placement.store';

const T0 = new Date('2026-09-24T10:00:00Z').getTime();

interface Row {
  id: string;
  lang: string;
  level: string;
  category: string;
  question: string;
  readText: string | null;
  options: string[];
  answer: string;
  timeLimitS: number;
}

/** Like the real bank: the answer listed first, which is why options get shuffled. */
function bank(perCell: number, passage: string | null): Row[] {
  return LEVELS.flatMap((level) =>
    QUESTION_CATEGORIES.flatMap((category) =>
      Array.from({ length: perCell }, (_, i) => ({
        id: randomUUID(),
        lang: 'de',
        level,
        category,
        question: `${level} ${category} ${i}`,
        readText: passage,
        options: ['right', 'wrong-1', 'wrong-2', 'wrong-3'],
        answer: 'right',
        timeLimitS: 30,
      })),
    ),
  );
}

/** Round-trips through JSON like Redis does, so nothing leans on object identity. */
function memoryStore(log: string[]) {
  const runs = new Map<string, string>();
  return {
    runs,
    load: async (userId: string) => {
      const raw = runs.get(userId);
      return raw === undefined ? null : (JSON.parse(raw) as Run);
    },
    save: async (userId: string, run: Run) => {
      log.push(run.current === null ? 'save:done' : 'save');
      runs.set(userId, JSON.stringify(run));
    },
    remove: async (userId: string) => void runs.delete(userId),
    withLock: <T>(_userId: string, work: () => Promise<T>) => work(),
  };
}

function setup({
  perCell = 5,
  courses = ['de'],
  passage = null,
}: { perCell?: number; courses?: string[]; passage?: string | null } = {}) {
  const rows = bank(perCell, passage);
  const seen = new Set<string>();
  const log: string[] = [];
  const store = memoryStore(log);

  const prisma = {
    questionBank: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          rows.find((row) => row.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ('id' in where) {
          const ids = (where.id as { in: string[] }).in;
          return rows.filter((row) => ids.includes(row.id));
        }
        return rows
          .filter(
            (row) =>
              row.lang === where.lang &&
              row.level === where.level &&
              row.category === where.category,
          )
          .filter((row) => !seen.has(row.id))
          .map((row) => ({ id: row.id }));
      }),
    },
    userSeenQuestion: {
      create: vi.fn(async ({ data }: { data: { questionId: string } }) => {
        seen.add(data.questionId);
        log.push('seen');
      }),
    },
  };
  const coursesService = {
    listCoursesUser: vi.fn(async () => ({
      courses: courses.map((lang) => ({ lang, level: null, dailyGoal: 30 })),
      activeLang: null,
    })),
    setLevel: vi.fn(async () => {
      log.push('setLevel');
    }),
  };

  const service = new PlacementService(
    prisma as unknown as PrismaService,
    store as unknown as PlacementStore,
    coursesService as unknown as CoursesService,
  );
  const row = (question: PlacementQuestion) =>
    rows.find((candidate) => candidate.id === question.questionId)!;
  const isQuestion = (value: PlacementQuestion | PlacementResult): value is PlacementQuestion =>
    'questionId' in value;

  return { service, prisma, courses: coursesService, store, seen, log, rows, row, isQuestion };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PlacementService start', () => {
  it('serves a B1 question and records it as seen before handing it over', async () => {
    const { service, seen, log } = setup();

    const question = await service.start('user-1', 'de');

    expect(question.level).toBe('B1');
    expect(seen.has(question.questionId)).toBe(true);
    expect(log).toEqual(['seen', 'save']);
  });

  it('refuses a second start while a run is going', async () => {
    const { service } = setup();
    await service.start('user-1', 'de');

    await expect(service.start('user-1', 'de')).rejects.toThrow(
      new ConflictException('placement.inProgress'),
    );
  });

  /** Nothing to quit first: a finished run just gives way. */
  it('replaces a finished run, which is how a retake starts', async () => {
    const setupped = setup();
    await playToTheEnd(setupped, () => false);

    await expect(setupped.service.start('user-1', 'de')).resolves.toMatchObject({ level: 'B1' });
  });

  it('refuses a language the learner has no course in', async () => {
    const { service } = setup({ courses: ['fr'] });

    await expect(service.start('user-1', 'de')).rejects.toThrow(
      new NotFoundException('course.notFound'),
    );
  });

  it('fails loudly when the probed level has nothing unseen left', async () => {
    const { service } = setup({ perCell: 0 });

    await expect(service.start('user-1', 'de')).rejects.toThrow(
      new NotFoundException('placement.poolExhausted'),
    );
  });
});

describe('PlacementService current', () => {
  it('says there is nothing when no run exists', async () => {
    const { service } = setup();

    await expect(service.current('user-1')).rejects.toThrow(
      new NotFoundException('placement.notFound'),
    );
  });

  /** A refresh must not reset the countdown, nor reshuffle the options. */
  it('resumes with the time actually left and the same option order', async () => {
    const { service } = setup();
    const served = await service.start('user-1', 'de');

    vi.setSystemTime(T0 + 12_000);
    const reloaded = (await service.current('user-1')) as PlacementQuestion;

    expect(reloaded.questionId).toBe(served.questionId);
    expect(reloaded.options).toEqual(served.options);
    expect(reloaded.remainingS).toBe(served.timeLimitS - 12);
  });

  it('never sends the answer', async () => {
    const question = await setup().service.start('user-1', 'de');

    expect(PlacementQuestionSchema.safeParse(question).success).toBe(true);
    expect(JSON.stringify(question)).not.toContain('"answer"');
  });

  /**
   * The bank lists the answer first, so without the shuffle it would always be
   * option one. Twenty serves all landing there by chance is one in 10^12.
   */
  it('does not always put the answer first', async () => {
    const { service, row } = setup({ perCell: 30 });
    const positions = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const question = await service.start('user-1', 'de');
      positions.add(question.options.indexOf(row(question).answer));
      await service.quit('user-1');
    }

    expect(positions.size).toBeGreaterThan(1);
  });

  /** The bank stores no passage as null, which the contract does not allow. */
  it('leaves readText out when the question has no passage', async () => {
    const question = await setup({ passage: null }).service.start('user-1', 'de');

    expect(JSON.parse(JSON.stringify(question))).not.toHaveProperty('readText');
  });

  it('sends the passage when there is one', async () => {
    const question = await setup({ passage: 'Ein Text.' }).service.start('user-1', 'de');

    expect(question.readText).toBe('Ein Text.');
  });

  /** Content removed while someone is mid-exam: a clear 409 rather than a 500. */
  it('calls the run expired when its question left the bank', async () => {
    const { service, rows, row } = setup();
    const question = await service.start('user-1', 'de');
    rows.splice(rows.indexOf(row(question)), 1);

    await expect(service.current('user-1')).rejects.toThrow(
      new ConflictException('placement.expired'),
    );
  });
});

describe('PlacementService answer', () => {
  it('moves on to the next question', async () => {
    const { service, row } = setup();
    const first = await service.start('user-1', 'de');

    const next = (await service.answer('user-1', {
      questionId: first.questionId,
      choice: row(first).answer,
    })) as PlacementQuestion;

    expect(next.questionId).not.toBe(first.questionId);
    expect(next.progress.answered).toBe(1);
  });

  it('refuses an answer to a question that is not on screen', async () => {
    const { service } = setup();
    await service.start('user-1', 'de');

    await expect(
      service.answer('user-1', { questionId: randomUUID(), choice: 'right' }),
    ).rejects.toThrow(new ConflictException('placement.questionMismatch'));
  });

  it('refuses a choice that is not one of the options', async () => {
    const { service } = setup();
    const question = await service.start('user-1', 'de');

    await expect(
      service.answer('user-1', { questionId: question.questionId, choice: 'made up' }),
    ).rejects.toThrow(new BadRequestException('placement.invalidChoice'));
  });

  it('says there is nothing to answer when no run exists', async () => {
    const { service } = setup();

    await expect(
      service.answer('user-1', { questionId: randomUUID(), choice: null }),
    ).rejects.toThrow(new NotFoundException('placement.notFound'));
  });

  /** The server's clock decides; a correct choice sent too late still counts as wrong. */
  it('scores a late answer as wrong even when it is right', async () => {
    const { service, row, store } = setup();
    const question = await service.start('user-1', 'de');

    vi.setSystemTime(T0 + (question.timeLimitS + 3) * 1000);
    await service.answer('user-1', {
      questionId: question.questionId,
      choice: row(question).answer,
    });

    const run = JSON.parse(store.runs.get('user-1')!) as Run;
    expect(run.answers[0].choice).toBeNull();
    expect(run.search.mistakes).toBe(1);
  });

  it('scores a timeout as a mistake', async () => {
    const { service, store } = setup();
    const question = await service.start('user-1', 'de');

    await service.answer('user-1', { questionId: question.questionId, choice: null });

    expect((JSON.parse(store.runs.get('user-1')!) as Run).search.mistakes).toBe(1);
  });

  it('writes C2 for a perfect run, never a level that does not exist', async () => {
    const setupped = setup();

    const result = await playToTheEnd(setupped, () => true);

    expect(result.level).toBe('C2');
    expect(setupped.courses.setLevel).toHaveBeenCalledWith('user-1', 'de', { level: 'C2' });
  });

  it('writes A1 for a run that gets nothing right', async () => {
    const setupped = setup();

    const result = await playToTheEnd(setupped, () => false);

    expect(result.level).toBe('A1');
    expect(setupped.courses.setLevel).toHaveBeenCalledWith('user-1', 'de', { level: 'A1' });
  });

  /** Postgres first: a failing Redis save afterwards leaves the level written, not lost. */
  it('writes the level before it saves the finished run', async () => {
    const setupped = setup();

    await playToTheEnd(setupped, () => false);

    expect(setupped.log.slice(-2)).toEqual(['setLevel', 'save:done']);
  });

  it('reports every answer in order, the right one beside what was chosen', async () => {
    const setupped = setup();

    // Right, wrong, right, wrong fails B1 and then A1: eight answers.
    const result = await playToTheEnd(setupped, (index) => index % 2 === 0);

    expect(result.report.map((entry) => entry.wasCorrect)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(result.report.every((entry) => entry.correct === 'right')).toBe(true);
  });

  /** The last answer sent again after its response was lost. */
  it('hands back the result when the run is already over', async () => {
    const setupped = setup();
    const result = await playToTheEnd(setupped, () => true);

    const again = await setupped.service.answer('user-1', {
      questionId: randomUUID(),
      choice: null,
    });

    expect(again).toEqual(result);
  });

  it('keeps the result readable after the run is over', async () => {
    const setupped = setup();
    const result = await playToTheEnd(setupped, () => true);

    await expect(setupped.service.current('user-1')).resolves.toEqual(result);
  });

  /** The bar must never move backwards, and it must reach its total exactly. */
  it('reports progress whose total only shrinks', async () => {
    const setupped = setup();
    const seen: Array<{ answered: number; total: number }> = [];

    await playToTheEnd(
      setupped,
      (index) => index !== 1,
      (question) => seen.push(question.progress),
    );

    seen.forEach(({ answered }, index) => expect(answered).toBe(index));
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].total).toBeLessThanOrEqual(seen[i - 1].total);
    }
    // One mistake at B1, then everything right: B1, C1 and C2, the full eighteen.
    expect(seen.at(-1)).toEqual({ answered: 17, total: 18 });
  });

  /**
   * If the next question cannot be drawn and the run were kept, the same
   * question could be answered again with each option, and which ones exhaust
   * the pool would give the answer away. So the run goes.
   */
  it('drops the run when the next question cannot be drawn', async () => {
    const { service, rows, row, store } = setup();
    const first = await service.start('user-1', 'de');
    const second = (await service.answer('user-1', {
      questionId: first.questionId,
      choice: 'wrong-1',
    })) as PlacementQuestion;
    // Failing B1 probes A1, and there is nothing left there.
    rows.splice(0, rows.length, ...rows.filter((candidate) => candidate.level !== 'A1'));

    await expect(
      service.answer('user-1', { questionId: second.questionId, choice: 'wrong-1' }),
    ).rejects.toThrow(new NotFoundException('placement.poolExhausted'));
    expect(store.runs.has('user-1')).toBe(false);
    await expect(
      service.answer('user-1', { questionId: second.questionId, choice: row(second).answer }),
    ).rejects.toThrow(new NotFoundException('placement.notFound'));
  });
});

describe('PlacementService quit', () => {
  it('drops the run and writes nothing to the course', async () => {
    const { service, store, courses } = setup();
    await service.start('user-1', 'de');

    await service.quit('user-1');

    expect(store.runs.has('user-1')).toBe(false);
    expect(courses.setLevel).not.toHaveBeenCalled();
  });

  it('is fine when there is nothing to quit', async () => {
    await expect(setup().service.quit('user-1')).resolves.toBeUndefined();
  });
});

/** Starts a run and answers until it ends. `correct(i)` decides the i-th answer. */
async function playToTheEnd(
  { service, row, isQuestion }: ReturnType<typeof setup>,
  correct: (index: number) => boolean,
  onQuestion: (question: PlacementQuestion) => void = () => {},
): Promise<PlacementResult> {
  let next: PlacementQuestion | PlacementResult = await service.start('user-1', 'de');
  for (let index = 0; isQuestion(next); index++) {
    onQuestion(next);
    const choice = correct(index) ? row(next).answer : 'wrong-1';
    next = await service.answer('user-1', { questionId: next.questionId, choice });
  }
  return next;
}
