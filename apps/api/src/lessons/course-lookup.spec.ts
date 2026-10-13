import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../generated/prisma/client';
import { checkCourse, findLesson, LESSON_SELECT, type LessonRow } from './course-lookup';

describe('checkCourse', () => {
  it('answers 404 course.notFound without a course, placed or not', () => {
    expect(() => checkCourse(null)).toThrow(NotFoundException);
    expect(() => checkCourse(null)).toThrow('course.notFound');
    expect(() => checkCourse(null, { placed: true })).toThrow(NotFoundException);
    expect(() => checkCourse(null, { placed: true })).toThrow('course.notFound');
  });

  it('answers 409 course.notPlaced for a course without a level, when placed', () => {
    expect(() => checkCourse({ level: null }, { placed: true })).toThrow(ConflictException);
    expect(() => checkCourse({ level: null }, { placed: true })).toThrow('course.notPlaced');
  });

  it('gives back a course without a level when placement is not needed', () => {
    const course = { id: 'c1', level: null };
    expect(checkCourse(course)).toBe(course);
  });

  it('gives back a placed course', () => {
    const course = { id: 'c1', level: 'A1' };
    expect(checkCourse(course, { placed: true })).toBe(course);
  });
});

describe('findLesson', () => {
  /** A fake Prisma client: findFirst gives back `found`, and records how it was called. */
  const fakeDb = (found: LessonRow | null) => {
    const findFirst = vi.fn().mockResolvedValue(found);
    const db = { lesson: { findFirst } } as unknown as Prisma.TransactionClient;
    return { db, findFirst };
  };

  const lesson: LessonRow = {
    id: 'fr-test-alpha',
    level: 'A1',
    position: 1,
    kind: 'grammar',
    topic: 'nouns_and_determiners',
    theme: null,
    title: 'Le, la, les',
    summary: 'Les articles définis.',
  };

  it('gives back the lesson, searched in this language only', async () => {
    const { db, findFirst } = fakeDb(lesson);

    await expect(findLesson(db, 'fr', 'fr-test-alpha')).resolves.toBe(lesson);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'fr-test-alpha', lang: 'fr' },
      select: LESSON_SELECT,
    });
  });

  it('answers 404 lesson.notFound for a lesson the database does not have', async () => {
    const { db } = fakeDb(null);

    await expect(findLesson(db, 'fr', 'fr-test-nowhere')).rejects.toThrow(NotFoundException);
    await expect(findLesson(db, 'fr', 'fr-test-nowhere')).rejects.toThrow('lesson.notFound');
  });

  it.each(['NOT_AN_ID', 'fr-test-1', `fr-${'a'.repeat(100)}`])(
    'answers 404 lesson.notFound for the malformed id %s, without asking the database',
    async (id) => {
      const { db, findFirst } = fakeDb(lesson);

      await expect(findLesson(db, 'fr', id)).rejects.toThrow('lesson.notFound');
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
});
