import { describe, expect, it } from 'vitest';
import type { LessonOutline } from '@/components/lesson/types';

import { lessonPoints } from './lesson-navigation';

const text = (en: string) => ({ en, fr: en, de: en });
const outline: LessonOutline = {
  lessonId: 'fr-subject-pronouns',
  kind: 'grammar',
  title: 'Pronouns',
  objective: text('Use pronouns'),
  minutes: 15,
  sections: [
    {
      title: text('Singular'),
      minutes: 5,
      points: [
        { number: 1, title: text('Explanation') },
        { number: 2, title: text('Typed gaps') },
      ],
    },
    { title: text('Plural'), minutes: 5, points: [{ number: 3, title: text('Explanation') }] },
    { title: text('Exam'), minutes: 5, points: [] },
  ],
  pages: [
    { role: 'presentation', step: text('Explanation'), seconds: 30, questions: 0, limitS: null },
    { role: 'practice', step: text('Typed gaps'), seconds: 30, questions: 2, limitS: null },
    { role: 'practice', step: text('Typed gaps'), seconds: 30, questions: 2, limitS: null },
    { role: 'presentation', step: text('Explanation'), seconds: 30, questions: 0, limitS: null },
    { role: 'discussion', step: text('Discussion'), seconds: 30, questions: 0, limitS: null },
    { role: 'examIntro', step: text('Exam'), seconds: 30, questions: 0, limitS: null },
    { role: 'exam', step: text('Exam'), seconds: 30, questions: 2, limitS: 60 },
  ],
};

describe('lesson timeline', () => {
  it('keeps consecutive practice pages on one point and repeated explanations separate', () => {
    expect(lessonPoints(outline).map(({ number, pages }) => ({ number, pages }))).toEqual([
      { number: 1, pages: [0] },
      { number: 2, pages: [1, 2] },
      { number: 3, pages: [3] },
    ]);
  });

  it('uses one colour per start-page section, independent of translated labels', () => {
    const points = lessonPoints(outline);
    expect(points[0]!.color).toBe(points[1]!.color);
    expect(points[2]!.color).not.toBe(points[0]!.color);
    expect(points[2]!.title).toEqual(outline.sections[1]!.points[0]!.title);
  });
});
