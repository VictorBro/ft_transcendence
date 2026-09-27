import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExamSession } from './placement.schema';

import { bankPrisma, examSession, questionRow, wrongChoice } from '../../test/placement.fixtures';
import type { PrismaService } from '../prisma/prisma.service';
import { PlacementProgressService } from './placement-progress.service';

const row = questionRow();
// Its answer is not listed first, unlike most bank rows.
const other = questionRow({
  category: 'vocabulary',
  options: ['Baum', 'Haus', 'Auto', 'Zug'],
  answer: 'Haus',
});
const progress = new PlacementProgressService(bankPrisma([other, row]) as unknown as PrismaService);

describe('PlacementProgressService', () => {
  it('finds a question by id and throws placement.notFound for an unknown one', async () => {
    await expect(progress.getQuestion(row.id)).resolves.toEqual(row);
    await expect(progress.getQuestion(randomUUID())).rejects.toThrow(
      new NotFoundException('placement.notFound'),
    );
  });

  describe('adjustSessionFromAnswer', () => {
    const fresh = { grammar: 0, vocabulary: 0, reading: 0 };
    const sixth = { askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 } };

    it.each<[string, Partial<ExamSession>, string | null, Partial<ExamSession>]>([
      [
        'a right answer counts the category',
        {},
        row.answer,
        { mistakesPerLevel: 0, askedPerCategory: { ...fresh, grammar: 1 }, level: 2 },
      ],
      [
        'a wrong answer is a mistake',
        {},
        wrongChoice(row),
        { mistakesPerLevel: 1, askedPerCategory: { ...fresh, grammar: 1 }, level: 2 },
      ],
      [
        'a timeout is a mistake',
        {},
        null,
        { mistakesPerLevel: 1, askedPerCategory: { ...fresh, grammar: 1 }, level: 2 },
      ],
      [
        'the second mistake halves down to A2',
        { mistakesPerLevel: 1, askedPerCategory: { ...fresh, grammar: 1 } },
        null,
        { lo: 0, hi: 2, level: 1, mistakesPerLevel: 0, askedPerCategory: fresh, ended: false },
      ],
      [
        'the sixth answer passes B1 despite one mistake and halves up to C1',
        { ...sixth, mistakesPerLevel: 1 },
        row.answer,
        { lo: 3, hi: 5, level: 4, mistakesPerLevel: 0, askedPerCategory: fresh, ended: false },
      ],
      [
        'passing C1, the level below hi, ends the run at C2',
        { ...sixth, lo: 3, level: 4 },
        row.answer,
        { level: 5, ended: true },
      ],
      [
        'failing A1, the level at lo, ends the run at A1',
        { lo: 0, hi: 1, level: 0, mistakesPerLevel: 1 },
        null,
        { level: 0, ended: true },
      ],
    ])('%s', (_, state, answer, expected) => {
      // Cloned, so a row that mutates its nested state cannot leak into the next one.
      const session = examSession(structuredClone(state));

      progress.adjustSessionFromAnswer(answer, row, session);

      expect(session).toMatchObject(expected);
    });

    it('rejects a choice that is not one of the options', () => {
      expect(() => progress.adjustSessionFromAnswer('nope', row, examSession())).toThrow(
        new BadRequestException('placement.invalidChoice'),
      );
    });
  });

  describe('hasTimedOut', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // 30s to answer, plus two seconds for the network.
    it.each([
      [0, false],
      [31, false],
      [32, true],
    ])('after %ss says %s', (elapsedS, expected) => {
      const servedAt = new Date(Date.now() - elapsedS * 1000).toISOString();

      expect(progress.hasTimedOut(row, servedAt)).toBe(expected);
    });
  });

  describe('getResult', () => {
    it('has none while the run is going', async () => {
      await expect(progress.getResult(examSession())).resolves.toBeUndefined();
    });

    // `other` comes first in the bank, so answer order has to come from the session.
    it('reports the level and every answer in the order given, skipping rows gone from the bank', async () => {
      const answers = [
        { questionId: row.id, choice: row.answer },
        { questionId: randomUUID(), choice: 'ist' },
        { questionId: other.id, choice: 'Baum' },
      ];

      await expect(
        progress.getResult(examSession({ ended: true, level: 4, answers })),
      ).resolves.toEqual({
        targetLevel: 'C1',
        report: [
          {
            questionId: row.id,
            question: row.question,
            options: row.options,
            chosen: 'ist',
            correct: 'ist',
            wasCorrect: true,
          },
          {
            questionId: other.id,
            question: other.question,
            options: other.options,
            chosen: 'Baum',
            correct: 'Haus',
            wasCorrect: false,
          },
        ],
      });
    });

    it('reports targetLevel null for a stored run without a level', async () => {
      const result = await progress.getResult(examSession({ ended: true, level: null }));

      expect(result).toEqual({ targetLevel: null, report: [] });
    });
  });
});
