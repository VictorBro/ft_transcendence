import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlacementQuestionSchema,
  PlacementResultSchema,
  type Language,
  type PlacementQuestion,
  type PlacementResult,
  type SubmitAnswerInput,
} from '@ft/shared';

import { CoursesService } from '../courses/courses.service';
import type { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  courseLevel,
  isDone,
  isLate,
  openCategories,
  probe,
  questionsLeft,
  remainingS,
  initial,
  step,
  type Search,
} from './placement.machine';
import { PlacementStore, type Current, type Run } from './placement.store';

/** Fisher-Yates. Math.random is enough: a client cannot see its state. */
function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * The placement exam over HTTP. The rules are in placement.machine, the run is
 * in Redis, and the only lasting writes are the questions a learner has seen and,
 * at the end, the course level.
 */
@Injectable()
export class PlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PlacementStore,
    private readonly courses: CoursesService,
  ) {}

  /** A finished run is replaced, which is how a retake starts. One still going is a 409. */
  start(userId: string, lang: Language): Promise<PlacementQuestion> {
    return this.store.withLock(userId, async () => {
      const existing = await this.store.load(userId);
      if (existing !== null && !isDone(existing.search)) {
        throw new ConflictException('placement.inProgress');
      }
      const { courses } = await this.courses.listCoursesUser(userId);
      if (!courses.some((course) => course.lang === lang)) {
        throw new NotFoundException('course.notFound');
      }

      return this.advance(userId, { lang, search: initial(), current: null, answers: [] });
    });
  }

  /** Read only: a refresh must not move the clock or the run. */
  async current(userId: string): Promise<PlacementQuestion | PlacementResult> {
    const run = await this.load(userId);
    if (run.current === null) {
      return this.result(run);
    }
    return this.view(run, run.current, await this.question(run.current.questionId));
  }

  answer(
    userId: string,
    { questionId, choice }: SubmitAnswerInput,
  ): Promise<PlacementQuestion | PlacementResult> {
    return this.store.withLock(userId, async () => {
      const run = await this.load(userId);
      // The last answer again, its response lost on the way: hand back the verdict.
      if (run.current === null) {
        return this.result(run);
      }
      if (questionId !== run.current.questionId) {
        throw new ConflictException('placement.questionMismatch');
      }
      const question = await this.question(questionId);
      if (choice !== null && !question.options.includes(choice)) {
        throw new BadRequestException('placement.invalidChoice');
      }

      // The server's clock decides what is late, whatever the request says.
      const given = isLate(run.current.servedAt, question.timeLimitS, Date.now()) ? null : choice;
      const search = step(run.search, {
        category: question.category,
        correct: given === question.answer,
      });
      const answered: Run = {
        ...run,
        search,
        current: null,
        answers: [...run.answers, { questionId, choice: given }],
      };

      if (isDone(search)) {
        // The level first, so a save that fails afterwards leaves it written rather
        // than lost. A retry is scored again on the server's clock and may be late.
        await this.courses.setLevel(userId, run.lang, { level: courseLevel(search) });
        await this.store.save(userId, answered);
        return this.result(answered);
      }
      // Kept, the run would let this question be answered again with each option,
      // and which one exhausts the pool would give the answer away. Retake instead.
      return this.advance(userId, answered).catch(async (error: unknown) => {
        await this.store.remove(userId);
        throw error;
      });
    });
  }

  /** Nothing is written on the way out, so quitting never costs a level already placed. */
  quit(userId: string): Promise<void> {
    return this.store.withLock(userId, () => this.store.remove(userId));
  }

  private async load(userId: string): Promise<Run> {
    const run = await this.store.load(userId);
    if (run === null) {
      throw new NotFoundException('placement.notFound');
    }
    return run;
  }

  private async question(id: string): Promise<QuestionBank> {
    const question = await this.prisma.questionBank.findUnique({ where: { id } });
    // The bank lost the question under a running exam, which cannot go on.
    if (question === null) {
      throw new ConflictException('placement.expired');
    }
    return question;
  }

  /**
   * Puts the next question on screen: unseen, at the probed level, from a
   * category still short of its two. Recorded as seen before it is shown, so an
   * abandoned run cannot bring it back. The options are shuffled because the bank
   * lists the answer first in almost every item.
   */
  private async advance(userId: string, run: Run): Promise<PlacementQuestion> {
    const question = await this.draw(userId, run.lang, run.search);
    await this.prisma.userSeenQuestion.create({ data: { userId, questionId: question.id } });

    const current = {
      questionId: question.id,
      servedAt: Date.now(),
      options: shuffle(question.options),
    };
    const next = { ...run, current };
    await this.store.save(userId, next);
    return this.view(next, current, question);
  }

  /** None left is a content gap, and fails loudly until the generator (#54) fills it. */
  private async draw(userId: string, lang: Language, search: Search): Promise<QuestionBank> {
    for (const category of shuffle(openCategories(search))) {
      const unseen = await this.prisma.questionBank.findMany({
        where: { lang, level: probe(search), category, userSeenQuestions: { none: { userId } } },
        select: { id: true },
      });
      if (unseen.length > 0) {
        return this.question(pick(unseen).id);
      }
    }
    throw new NotFoundException('placement.poolExhausted');
  }

  /** The browser's copy. Parsed strictly, so an answer in it is a 500, never a leak. */
  private view(run: Run, current: Current, question: QuestionBank): PlacementQuestion {
    return PlacementQuestionSchema.parse({
      questionId: question.id,
      category: question.category,
      level: question.level,
      question: question.question,
      readText: question.readText ?? undefined,
      options: current.options,
      timeLimitS: question.timeLimitS,
      remainingS: remainingS(current.servedAt, question.timeLimitS, Date.now()),
      progress: {
        answered: run.answers.length,
        total: run.answers.length + questionsLeft(run.search),
      },
    });
  }

  /** Worked out from the run each time it is asked for, never stored. */
  private async result({ search, answers }: Run): Promise<PlacementResult> {
    const questions = await this.prisma.questionBank.findMany({
      where: { id: { in: answers.map((entry) => entry.questionId) } },
    });
    const byId = new Map(questions.map((question) => [question.id, question]));

    return PlacementResultSchema.parse({
      level: courseLevel(search),
      report: answers.flatMap(({ questionId, choice }) => {
        const question = byId.get(questionId);
        return question === undefined
          ? []
          : [
              {
                questionId,
                question: question.question,
                chosen: choice,
                correct: question.answer,
                wasCorrect: choice === question.answer,
              },
            ];
      }),
    });
  }
}
