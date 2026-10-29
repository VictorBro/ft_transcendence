import { describe, expect, it } from 'vitest';

import { BY_KIND, FIXTURE_LESSONS, fixtureLesson, refOf } from './fixtures.testing';
import { lessonOutline } from './outline';
import { buildPlan, type LessonPlan } from './plan';
import { pageView } from './redact';
import { LessonOutlineSchema, PageViewSchema, type PageView } from './view';

/**
 * The leak test: what the browser gets of a page holds no key.
 *
 * It runs on every page of every test lesson (PR #142's samples, with
 * the reading one, until #84's French A1 lessons land), with English and
 * German as the mother tongue.
 */

/** Every string in a value, at any depth, object keys included. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      strings(v, out);
    }
  return out;
}

/** Every authored id of a lesson: the values of its id fields (id, itemId, targetIds…). */
function authoredIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) authoredIds(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (/(^id|Id|Ids)$/.test(k)) for (const s of strings(v)) out.add(s);
      authoredIds(v, out);
    }
  return out;
}

/** The refs of a page view: every `ref` and `gap` value. */
function refs(view: PageView): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'ref' || k === 'gap') && typeof x === 'string') out.push(x);
        else walk(x);
      }
  };
  walk(view);
  return out;
}

const views = (plan: LessonPlan, secret = 'secret') =>
  plan.pages.map((_, n) => pageView(plan, n, refOf(secret)));

describe.each(FIXTURE_LESSONS)('the page views of %s', (id) => {
  const lesson = fixtureLesson(id);
  const ids = authoredIds(lesson);

  it.each(['en', 'de'] as const)('hold no key, with %s as mother tongue', (tongue) => {
    const plan = buildPlan(lesson, tongue);
    const explanations = new Set(
      plan.pages.flatMap((p) => p.units.flatMap((u) => Object.values(u.explanation))),
    );
    for (const [n, page] of plan.pages.entries()) {
      const view = PageViewSchema.parse(pageView(plan, n, refOf('secret')));
      const values = strings(view);
      // No explanation of the page's own units; on an exam page, of no unit of the lesson.
      // (A flashcard teaches what an expression means, and a later exercise may explain
      // its answer with the same words: that is teaching, not a key.)
      const keys =
        page.role === 'exam'
          ? explanations
          : new Set(page.units.flatMap((u) => Object.values(u.explanation)));
      for (const v of values) expect(keys.has(v), `${page.pageId}: ${v}`).toBe(false);
      // No accepted answer of an exam text unit on its page.
      if (page.role === 'exam')
        for (const u of page.units)
          if (u.kind === 'text')
            for (const a of u.accepted.answers)
              expect(values, `${page.pageId}: ${a}`).not.toContain(a);
      // No ref is an authored id.
      for (const r of refs(view)) expect(ids.has(r), `${page.pageId}: ${r}`).toBe(false);
    }
    expect(
      strings(LessonOutlineSchema.parse(lessonOutline(plan))).some((v) => explanations.has(v)),
    ).toBe(false);
  });

  it('give other refs and another order with another secret', () => {
    const plan = buildPlan(lesson, 'en');
    const a = views(plan, 'one');
    const b = views(plan, 'two');
    const all = (list: PageView[]) => list.flatMap(refs);
    const shared = new Set(all(a));
    expect(all(b).some((r) => shared.has(r))).toBe(false);
    // At least one shuffled list comes in another order.
    const texts = (list: PageView[]) =>
      JSON.stringify(
        list.map((v) => strings(v.items).filter((s) => !/^[A-Za-z0-9_-]{16}$/.test(s))),
      );
    expect(texts(a)).not.toBe(texts(b));
  });
});

describe('pageView', () => {
  it('sends the exam document only with the exam page, and never the genre', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.reading), 'en');
    const content = plan.content;
    if (content.kind !== 'reading') throw new Error('not reading');
    const exam = content.documents.find((d) => d.documentId === 'exam')!;
    const main = content.documents.find((d) => d.documentId === 'main')!;
    for (const [n, page] of plan.pages.entries()) {
      const text = JSON.stringify(pageView(plan, n, refOf('s')));
      expect(text.includes(exam.paragraphs[0]), page.pageId).toBe(page.role === 'exam');
      if (page.role === 'exam') expect(text.includes(main.paragraphs[0])).toBe(false);
      expect(text).not.toContain(content.genre);
    }
  });

  it('keeps the persons of a person matching, true or false and gender options in order', () => {
    const grammar = buildPlan(fixtureLesson(BY_KIND.grammar), 'en');
    const persons = grammar.pages.findIndex((p) => p.pageId === 'ex-pl-persons-1');
    const [item] = pageView(grammar, persons, refOf('s')).items;
    if (item.type !== 'grammar_person_matching') throw new Error(item.type);
    const unit = grammar.pages[persons].units[0];
    expect(item.units[0].options.map((o) => o.text)).toEqual(
      unit.kind === 'choice' ? unit.options.map((o) => o.text) : [],
    );
    const vocabulary = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    const overview = vocabulary.pages.findIndex((p) => p.pageId === 'overview');
    const [gender] = pageView(vocabulary, overview, refOf('s')).items;
    if (gender.type !== 'vocabulary_gender_select') throw new Error(gender.type);
    expect(gender.units[0].options.map((o) => o.text)).toEqual(['masculine', 'feminine']);
    const reading = buildPlan(fixtureLesson(BY_KIND.reading), 'en');
    const detail = reading.pages.findIndex((p) => p.pageId === 'detail');
    const tf = pageView(reading, detail, refOf('s')).items.find(
      (i) => i.type === 'reading_true_false',
    );
    expect(tf?.type === 'reading_true_false' && tf.units[0].options.map((o) => o.text)).toEqual([
      'Vrai',
      'Faux',
    ]);
  });

  it('gives a translation exam unit its article hint', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    const exam = plan.pages.findIndex((p) => p.role === 'exam');
    const [item] = pageView(plan, exam, refOf('s')).items;
    if (item.type !== 'vocabulary_translation_exam') throw new Error(item.type);
    expect(item.units[0].article).toBe('indefinite');
  });

  it('throws for an item that names a part its brief does not have', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    const cards = plan.pages.findIndex((p) =>
      p.items.some((i) => i.type === 'vocabulary_flashcards'),
    );
    const brief = plan.brief;
    if (brief.kind !== 'vocabulary') throw new Error('not vocabulary');
    const [first, ...rest] = brief.targets;
    const broken = { ...plan, brief: { ...brief, targets: rest } };
    expect(() => pageView(broken, cards, refOf('s'))).toThrow(
      `Word ${first.id} is not in the lesson`,
    );
  });

  it('throws for a page that does not exist', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    expect(() => pageView(plan, plan.pages.length, refOf('s'))).toThrow(/no page/);
  });
});
