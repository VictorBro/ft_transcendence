import { describe, expect, it } from 'vitest';

import { articleHint, startsWithArticle } from './articleHint';
import { PLAYER_COPY } from './copy';
import { BY_KIND, FIXTURE_LESSONS, fixtureLesson } from './fixtures.testing';
import { kindModule, requiredReveals, skipsFeedbackWhenRight } from './kinds';
import { motherTongue } from './motherTongue';
import { buildPlan, isScored, wordOrder, type LessonPlan, type PlanPage } from './plan';
import { scoreUnit } from './score';

const plan = (id: (typeof FIXTURE_LESSONS)[number], tongue: 'en' | 'de' = 'en') =>
  buildPlan(fixtureLesson(id), tongue);
const page = (p: LessonPlan, pageId: string) => p.pages.find((x) => x.pageId === pageId)!;
const roles = (p: LessonPlan) => p.pages.map((x) => [x.pageId, x.role, x.units.length]);

describe('buildPlan', () => {
  it('builds a vocabulary lesson from its brief: groups interleaved, no listening', () => {
    expect(roles(plan(BY_KIND.vocabulary))).toEqual([
      ['intro-all', 'presentation', 0],
      ['cards-all', 'presentation', 0],
      ['match-1', 'practice', 4],
      ['overview', 'practice', 4],
      ['gap-livre', 'practice', 1],
      ['gap-chaise', 'practice', 1],
      ['gap-stylo', 'practice', 1],
      ['gap-table', 'practice', 1],
      ['discussion', 'discussion', 0],
      ['exam-intro', 'examIntro', 0],
      ['exam-all-1', 'exam', 4],
    ]);
  });

  it('interleaves the introduction and flashcards of several groups', () => {
    const lesson = fixtureLesson(BY_KIND.vocabulary);
    if (lesson.brief.kind !== 'vocabulary') throw new Error('not vocabulary');
    const [a, b, c, d] = lesson.brief.targets.map((t) => t.id);
    const groups = [
      { ...lesson.brief.groups[0], id: 'g1', targetIds: [a, b] },
      { ...lesson.brief.groups[0], id: 'g2', targetIds: [c, d] },
    ];
    const p = buildPlan({ ...lesson, brief: { ...lesson.brief, groups } }, 'en');
    expect(p.pages.slice(0, 5).map((x) => x.pageId)).toEqual([
      'intro-g1',
      'cards-g1',
      'intro-g2',
      'cards-g2',
      'match-1',
    ]);
  });

  it('keeps every other page in its place when it interleaves', () => {
    const p = plan(BY_KIND.vocabulary);
    const [intro, cards, other] = p.pages;
    const shuffled = [{ ...intro, pageId: 'i1' }, other, { ...intro, pageId: 'i2' }, cards];
    const arranged = kindModule('vocabulary').arrange(shuffled);
    expect(arranged.map((x) => x.pageId)).toEqual(['i1', other.pageId, 'cards-all', 'i2']);
  });

  it('throws for an item that names a word the brief does not have', () => {
    const lesson = fixtureLesson(BY_KIND.vocabulary);
    if (lesson.brief.kind !== 'vocabulary') throw new Error('not vocabulary');
    const [first, ...rest] = lesson.brief.targets;
    const brief = { ...lesson.brief, targets: rest };
    const units = kindModule('vocabulary').units(brief, plan(BY_KIND.vocabulary).content, 'en');
    const item = { type: 'vocabulary_typed_gap', itemId: 'x', targetId: first.id } as never;
    expect(() => units(item, () => 'x')).toThrow(`Word ${first.id} is not in the lesson`);
  });

  it('labels the exam step the same in every lesson, whatever its file says', () => {
    const lesson = fixtureLesson(BY_KIND.grammar);
    if (!lesson.content) throw new Error('no content');
    const steps = lesson.content.steps.map((s) =>
      s.role === 'exam' ? { ...s, label: { en: 'Test', fr: 'Test', de: 'Test' } } : s,
    );
    const p = buildPlan({ ...lesson, content: { ...lesson.content, steps } as never }, 'en');
    for (const x of p.pages.filter((y) => y.role === 'exam' || y.role === 'examIntro'))
      expect(x.stepLabel).toEqual(PLAYER_COPY.exam);
  });

  it('holds no vocabulary listening item in any lesson', () => {
    for (const id of FIXTURE_LESSONS) {
      const types = plan(id).pages.flatMap((p) => p.items.map((it) => it.type));
      expect(types).not.toContain('vocabulary_listening_choice');
      expect(types).not.toContain('vocabulary_listening_dictation');
    }
  });

  it('puts one unscored discussion page right before the exam info page, in every kind', () => {
    for (const id of FIXTURE_LESSONS) {
      const p = plan(id);
      const first = p.pages.findIndex((x) => x.role === 'exam');
      expect(
        p.pages.slice(first - 2, first).map((x) => x.role),
        id,
      ).toEqual(['discussion', 'examIntro']);
      expect(
        p.pages.filter((x) => x.role === 'discussion'),
        id,
      ).toHaveLength(1);
      const discussion = p.pages[first - 2];
      expect(isScored(discussion)).toBe(false);
      expect(discussion.items).toEqual([]);
      expect(discussion.instructions.en).toMatch(/Talk about/);
      // Indexes follow the order.
      expect(p.pages.map((x) => x.index)).toEqual(p.pages.map((_, n) => n));
    }
  });

  it('turns the grammar feedback placeholder into the discussion page, with its planned time', () => {
    const p = plan(BY_KIND.grammar);
    const discussion = page(p, 'feedback');
    expect(discussion).toMatchObject({ role: 'discussion', items: [], units: [] });
    expect(discussion.stepLabel.en).toBe('Discussion');
    const types = p.pages.flatMap((x) => x.items.map((it) => it.type));
    expect(types).not.toContain('production_feedback_placeholder');
  });

  it('makes every page of the exam step an exam page with its countdown', () => {
    const p = plan(BY_KIND.grammar);
    const exam = p.pages.filter((x) => x.role === 'exam');
    expect(exam.map((x) => [x.pageId, x.timeLimitS])).toEqual([
      ['exam-forms', expect.any(Number)],
      ['exam-singular', expect.any(Number)],
      ['exam-plural', expect.any(Number)],
    ]);
    expect(page(p, 'exam-intro')).toMatchObject({
      role: 'examIntro',
      timeLimitS: null,
      units: [],
      stepLabel: PLAYER_COPY.exam,
      instructions: PLAYER_COPY.examIntro,
    });
  });

  it('plans the units of every kind with the attempt’s mother tongue', () => {
    const exam = (p: LessonPlan) => p.pages.find((x) => x.role === 'exam')!.units[0];
    expect(exam(plan(BY_KIND.vocabulary)).prompt.native).toBe('a book');
    expect(exam(plan(BY_KIND.vocabulary, 'de')).prompt.native).toMatch(/Buch/);
    const kinds = (p: LessonPlan) => new Set(p.pages.flatMap((x) => x.units.map((u) => u.kind)));
    expect(kinds(plan(BY_KIND.grammar))).toEqual(new Set(['choice', 'text', 'spot']));
    expect(kinds(plan('fr-negation-ne-pas'))).toEqual(new Set(['choice', 'text', 'order', 'spot']));
    expect(kinds(plan(BY_KIND.functions))).toEqual(new Set(['choice', 'text', 'order']));
    expect(kinds(plan(BY_KIND.reading))).toEqual(new Set(['choice', 'order']));
    for (const id of FIXTURE_LESSONS)
      for (const u of plan(id).pages.flatMap((x) => x.units)) {
        expect(u.explanation.en.length, u.id).toBeGreaterThan(0);
        expect(u.answer.length, u.id).toBeGreaterThan(0);
      }
  });

  it('carries the grammar rules on every grammar unit', () => {
    const units = plan(BY_KIND.grammar).pages.flatMap((x) => x.units);
    for (const u of units) expect(u.ruleIds?.length, u.id).toBeGreaterThan(0);
  });

  it('gives a gender row its form and translation, for the feedback', () => {
    const [row] = page(plan(BY_KIND.vocabulary), 'overview').units;
    expect(row).toMatchObject({
      kind: 'choice',
      answerLang: 'ui',
      form: 'un livre',
      translation: 'book',
    });
    if (row.kind !== 'choice') throw new Error('not a choice');
    expect(row.options.map((o) => o.id)).toEqual(['masculine', 'feminine']);
    const functions = page(plan(BY_KIND.functions), 'gender').units[0];
    expect(functions.form).toMatch(/^(un|une|des|le|la|l') /u);
  });

  it('leaves the full stop that ends every accepted order out of a word order', () => {
    const tokens = [
      { tokenId: 'je', text: 'Je' },
      { tokenId: 'suis', text: 'suis' },
      { tokenId: 'la', text: 'là' },
      { tokenId: 'stop', text: '.' },
    ];
    const order = wordOrder({
      tokens,
      acceptedOrders: [
        ['je', 'suis', 'la', 'stop'],
        ['la', 'je', 'suis', 'stop'],
      ],
    });
    expect(order.tokens.map((t) => t.id)).toEqual(['je', 'suis', 'la']);
    expect(order.acceptedOrders).toEqual([
      ['je', 'suis', 'la'],
      ['la', 'je', 'suis'],
    ]);
    expect(order.answer).toBe('Je suis là');
    // A full stop that does not end every order, or a "?", stays a token.
    const kept = wordOrder({ tokens, acceptedOrders: [['je', 'suis', 'stop', 'la']] });
    expect(kept.tokens.map((t) => t.id)).toContain('stop');
    const question = wordOrder({
      tokens: [...tokens.slice(0, 3), { tokenId: 'q', text: '?' }],
      acceptedOrders: [['je', 'suis', 'la', 'q']],
    });
    expect(question.tokens.map((t) => t.id)).toContain('q');
  });

  it('marks a noun taught in the plural as a plurale tantum, in vocabulary and functions', () => {
    // Vocabulary: a target with number "plural".
    const vocabulary = fixtureLesson(BY_KIND.vocabulary);
    if (vocabulary.brief.kind !== 'vocabulary') throw new Error('not vocabulary');
    const [livre, ...others] = vocabulary.brief.targets;
    const ciseaux = {
      ...livre,
      term: 'ciseaux',
      number: 'plural' as const,
      teachingForm: 'des ciseaux',
      examForms: ['des ciseaux'],
    };
    const v = buildPlan(
      { ...vocabulary, brief: { ...vocabulary.brief, targets: [ciseaux, ...others] } },
      'en',
    );
    const vUnit = v.pages.flatMap((x) => x.units).find((u) => u.id.endsWith(`/exam-${livre.id}`))!;
    // Functions: a word whose teaching form starts with "des".
    const functions = fixtureLesson(BY_KIND.functions);
    if (functions.brief.kind !== 'functions' || !functions.content)
      throw new Error('not functions');
    const words = functions.brief.words.map((w) =>
      w.id === 'cafe' ? { ...w, teachingForm: 'des cafés' } : w,
    );
    const steps = functions.content.steps.map((s) => ({
      ...s,
      pages: s.pages.map((pg) => ({
        ...pg,
        items: pg.items.map((it) =>
          it.type === 'function_translation_exam' && it.wordId === 'cafe'
            ? { ...it, accepted: { answers: ['des cafés'] } }
            : it,
        ),
      })),
    }));
    const f = buildPlan(
      {
        brief: { ...functions.brief, words },
        content: { ...functions.content, steps } as typeof functions.content,
      },
      'en',
    );
    const fUnit = f.pages.flatMap((x) => x.units).find((u) => u.id === 'exam-words/word-cafe')!;

    for (const [unit, answer] of [
      [vUnit, 'des ciseaux'],
      [fUnit, 'des cafés'],
    ] as const) {
      if (unit.kind !== 'text') throw new Error('not a text unit');
      expect(unit.noun?.pluraleTantum).toBe(true);
      // "des …" counts only with a right gender.
      expect(scoreUnit(unit, { text: answer }).points).toBe(0);
      expect(scoreUnit(unit, { text: answer, gender: 'feminine' }).points).toBe(0);
      expect(scoreUnit(unit, { text: answer, gender: 'masculine' }).points).toBe(1);
    }
  });

  it('keeps the distractors of a functions exam reply', () => {
    const reply = page(plan(BY_KIND.functions), 'exam-replies-1').units[0];
    expect(reply.kind === 'order' && reply.distractors?.length).toBeTruthy();
    expect(reply.prompt.learning).toMatch(/: /);
  });

  it('plans reading true or false in the course language', () => {
    const tf = page(plan(BY_KIND.reading), 'detail').units.find(
      (u) => u.itemType === 'reading_true_false',
    )!;
    expect(tf.kind === 'choice' && tf.options.map((o) => o.text)).toEqual(['Vrai', 'Faux']);
  });

  it('throws on a lesson row without its content file', () => {
    const { brief } = fixtureLesson(BY_KIND.grammar);
    expect(() => buildPlan({ brief, content: null }, 'en')).toThrow(/no content file/);
  });
});

describe('the kind traits', () => {
  const at = (id: (typeof FIXTURE_LESSONS)[number], pageId: string): PlanPage =>
    page(plan(id), pageId);

  it('skips the feedback of a page right at once only when every item asks one answer or is a board', () => {
    expect(skipsFeedbackWhenRight(at(BY_KIND.vocabulary, 'match-1'))).toBe(true);
    expect(skipsFeedbackWhenRight(at(BY_KIND.vocabulary, 'gap-livre'))).toBe(true);
    expect(skipsFeedbackWhenRight(at(BY_KIND.vocabulary, 'overview'))).toBe(false); // a gender table
    expect(skipsFeedbackWhenRight(at(BY_KIND.grammar, 'ex-pl-persons-1'))).toBe(true);
    expect(skipsFeedbackWhenRight(at(BY_KIND.grammar, 'ex-pl-typing-1'))).toBe(true);
    expect(skipsFeedbackWhenRight(at(BY_KIND.reading, 'detail'))).toBe(false); // with the document
    // Never on an exam or a presentation page.
    expect(skipsFeedbackWhenRight(at(BY_KIND.vocabulary, 'exam-all-1'))).toBe(false);
    expect(skipsFeedbackWhenRight(at(BY_KIND.vocabulary, 'cards-all'))).toBe(false);
  });

  it('asks to turn every flashcard and show every dialogue line after the first', () => {
    const cards = requiredReveals(at(BY_KIND.vocabulary, 'cards-all'));
    expect(cards).toEqual([
      { itemId: expect.any(String), keys: ['livre', 'chaise', 'stylo', 'table'] },
    ]);
    const dialogue = at(BY_KIND.functions, 'dialogue');
    const item = dialogue.items[0];
    if (item.type !== 'function_dialogue') throw new Error('not a dialogue');
    expect(requiredReveals(dialogue)).toEqual([
      { itemId: item.itemId, keys: item.lines.slice(1).map((l) => l.lineId) },
    ]);
    expect(requiredReveals(at(BY_KIND.reading, 'flashcards'))[0].keys).toHaveLength(5);
    expect(requiredReveals(at(BY_KIND.grammar, 'block-singular-explanation'))).toEqual([]);
  });
});

describe('motherTongue', () => {
  it('is the interface locale, or the first other one when it is the course language', () => {
    expect(motherTongue('de', 'fr')).toBe('de');
    expect(motherTongue('en', 'fr')).toBe('en');
    expect(motherTongue('fr', 'fr')).toBe('en');
    expect(motherTongue('en', 'en')).toBe('fr');
    expect(motherTongue('de', 'de')).toBe('en');
  });
});

describe('articleHint', () => {
  it('tells an indefinite, a definite or no French article', () => {
    expect(articleHint('un livre', 'fr')).toBe('indefinite');
    expect(articleHint('des ciseaux', 'fr')).toBe('indefinite');
    expect(articleHint('la table', 'fr')).toBe('definite');
    expect(articleHint('l’Espagne', 'fr')).toBe('definite');
    expect(articleHint('lundi', 'fr')).toBe(null);
    expect(startsWithArticle("l'Espagne", 'fr')).toBe(true);
    expect(startsWithArticle('lundi', 'fr')).toBe(false);
    // No article rule for another course language yet.
    expect(startsWithArticle('der Tisch', 'de')).toBe(false);
  });
});
