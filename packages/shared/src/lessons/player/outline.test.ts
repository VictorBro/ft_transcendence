import { describe, expect, it } from 'vitest';

import { BY_KIND, FIXTURE_LESSONS, fixtureLesson } from './fixtures.testing';
import { lessonOutline } from './outline';
import { buildPlan } from './plan';
import { LessonOutlineSchema } from './view';

const outline = (id: (typeof FIXTURE_LESSONS)[number]) =>
  lessonOutline(buildPlan(fixtureLesson(id), 'en'));
const sections = (id: (typeof FIXTURE_LESSONS)[number]) =>
  outline(id).sections.map((s) => [s.title.en, s.points.map((p) => `${p.number} ${p.title.en}`)]);

describe('lessonOutline', () => {
  it('parses with its strict schema for every lesson, with one entry per page', () => {
    for (const id of FIXTURE_LESSONS) {
      const plan = buildPlan(fixtureLesson(id), 'en');
      const o = LessonOutlineSchema.parse(lessonOutline(plan));
      expect(o.pages).toHaveLength(plan.pages.length);
      expect(o.pages.reduce((n, p) => n + p.questions, 0)).toBe(
        plan.pages.reduce((n, p) => n + p.units.length, 0),
      );
      // The exam section is last, with no points.
      expect(o.sections.at(-1)?.points).toEqual([]);
    }
  });

  it('gives vocabulary one section per group, then the exercises, then the exam', () => {
    expect(sections(BY_KIND.vocabulary)).toEqual([
      ['Classroom objects', ['1 Introduction', '2 Flashcards']],
      ['Exercises', ['3 Matching', '4 Gender', '5 Practice']],
      ['Final exam', []],
    ]);
    expect(outline(BY_KIND.vocabulary).words).toBe(4);
  });

  it('gives grammar one section per block, named by the block, its explanations as points', () => {
    const [singular, plural] = sections(BY_KIND.grammar);
    expect(singular[1]).toEqual([
      '1 être in the singular',
      '2 Multiple-choice gaps 1',
      '3 Typed gaps 1',
      '4 Error spotting',
    ]);
    expect(plural[1]).toHaveLength(5);
    expect(outline(BY_KIND.grammar).newVerbs).toEqual([
      { infinitive: 'être', translation: { en: 'to be', de: 'sein' } },
    ]);
  });

  it('names the functions sections by their steps, and gives the situation and roles', () => {
    const o = outline(BY_KIND.functions);
    expect(o.sections.map((s) => s.title.en)).toEqual([
      'Flashcards · Dialogue',
      'Matching · Gender · Dialogue gaps · Word order · Listening',
      'Final exam',
    ]);
    expect(o.roles).toEqual(['le serveur', 'la cliente']);
    expect(o.situation?.en).toMatch(/café/);
  });

  it('gives reading the key words and the document, and neither the genre nor the situation', () => {
    const o = outline(BY_KIND.reading);
    expect(o.sections.map((s) => s.title.en)).toEqual(['Key words', 'The document', 'Final exam']);
    expect(JSON.stringify(o)).not.toMatch(/text_message/);
    // The situation names the genre and answers the skim question.
    const lesson = fixtureLesson(BY_KIND.reading);
    if (lesson.brief.kind !== 'reading') throw new Error('not reading');
    expect(o.situation).toBeUndefined();
    expect(JSON.stringify(o)).not.toContain(lesson.brief.situation.en);
  });

  it('counts the minutes from the page durations, every section at least one', () => {
    const o = outline(BY_KIND.grammar);
    const plan = buildPlan(fixtureLesson(BY_KIND.grammar), 'en');
    const seconds = plan.pages.reduce((s, p) => s + p.estimatedDurationS, 0);
    expect(o.minutes).toBe(Math.round(seconds / 60));
    for (const s of o.sections) expect(s.minutes).toBeGreaterThanOrEqual(1);
    expect(o.pages.filter((p) => p.role === 'exam').every((p) => p.limitS !== null)).toBe(true);
  });
});
