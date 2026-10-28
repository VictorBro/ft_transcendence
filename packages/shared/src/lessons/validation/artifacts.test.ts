import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LessonOutlineFileSchema } from '../../schemas/lesson';
import { examInstruction } from '../domain/lessonCopy';
import { vocabularyLesson } from '../domain/vocabularyLesson';
import { briefSchema, contentSchema, type Brief } from '../schemas/artifacts';
import {
  grammarBriefLengthIssues,
  grammarContentLengthIssues,
  validateBrief,
  validateContent,
  type OutlineContext,
} from './artifacts';

/**
 * Ported from the lesson prototype (tests/unit/artifacts.test.ts at 928484d).
 *
 * Two fixture folders, both in packages/shared/test/fixtures:
 * - content/: short lessons written for these tests. The grammar ones are
 *   valid but too short for the length rules, on purpose;
 * - samples/: complete lessons of the prototype, and its French A1 outline,
 *   which every context here is read from.
 */

const FIXTURES = join(__dirname, '../../../test/fixtures');
const outline = LessonOutlineFileSchema.parse(
  JSON.parse(readFileSync(join(FIXTURES, 'samples/outlines/fr-a1.json'), 'utf8')),
);

const FIXTURE_IDS = [
  'fr-classroom-objects',
  'fr-classroom-instructions',
  'fr-verb-etre-present',
  'fr-negation-ne-pas',
] as const;
type FixtureId = (typeof FIXTURE_IDS)[number];

// The fixtures are edited freely by each test, so they are read untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const load = (id: FixtureId, file: 'brief' | 'content'): Json =>
  JSON.parse(
    readFileSync(
      join(FIXTURES, 'content', file === 'brief' ? 'briefs' : 'lessons', `${id}.json`),
      'utf8',
    ),
  );

function ctx(id: string): OutlineContext {
  const entry = outline.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`no outline entry ${id}`);
  return { entry, lang: outline.lang, level: outline.level };
}

function checkBrief(id: FixtureId, mutate?: (b: Json) => void) {
  const brief = load(id, 'brief');
  mutate?.(brief);
  return validateBrief(brief, ctx(id));
}

function checkContent(id: FixtureId, mutate?: (c: Json) => void, mutateBrief?: (b: Json) => void) {
  const brief = load(id, 'brief');
  mutateBrief?.(brief);
  const content = load(id, 'content');
  mutate?.(content);
  return validateContent(content, { ...ctx(id), brief: brief as Brief });
}

const messages = (r: { issues: { path: string; message: string }[] }) =>
  r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');

const VOCABULARY = new Set<FixtureId>(['fr-classroom-objects', 'fr-classroom-instructions']);

/**
 * A French fixture as a German or English one: the course language
 * changes, so the native translations { en, de } become { en, fr } (de)
 * or { fr, de } (en). The texts stay French: only the rules change.
 */
function asCourse(data: Json, lang: 'de' | 'en'): Json {
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (v === null || typeof v !== 'object') return v;
    const keys = Object.keys(v).sort().join();
    if (keys === 'de,en')
      return lang === 'de'
        ? { en: walk(v.en), fr: walk(v.de) }
        : { fr: walk(v.en), de: walk(v.de) };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  };
  return { ...walk(data), lang };
}

function checkBriefAs(lang: 'de' | 'en', id: FixtureId, mutate?: (b: Json) => void) {
  const brief = asCourse(load(id, 'brief'), lang);
  mutate?.(brief);
  return validateBrief(brief, { ...ctx(id), lang });
}

describe('fixture artifacts', () => {
  it.each(FIXTURE_IDS)('%s brief (and grammar content) are valid', (id) => {
    const brief = checkBrief(id);
    expect(messages(brief)).toBe('');
    expect(brief.status).toBe('valid');
    if (VOCABULARY.has(id)) return;
    const content = checkContent(id);
    expect(messages(content)).toBe('');
    expect(content.status).toBe('valid');
  });

  it('derives vocabulary lessons from the brief and rejects a vocabulary content file', () => {
    const brief = load('fr-classroom-objects', 'brief');
    const lesson = vocabularyLesson(brief);
    expect(lesson.steps.map((st) => st.stage)).toEqual([
      'introduction',
      'flashcards',
      'matching',
      'overview',
      'practice',
      'practice',
      'exam',
    ]);
    expect(lesson.steps.map((st) => st.id)).toEqual([
      'introduction',
      'flashcards',
      'matching',
      'overview',
      'practice',
      'listening',
      'exam',
    ]);
    expect(() => contentSchema('vocabulary', 'fr').parse(lesson)).not.toThrow();
    expect(messages(validateContent(lesson, { ...ctx('fr-classroom-objects'), brief }))).toMatch(
      /vocabulary lessons have no content file/,
    );
  });

  it('leaves out the gender step of a vocabulary lesson without nouns, as in function lessons', () => {
    const lesson = vocabularyLesson(load('fr-classroom-instructions', 'brief'));
    expect(lesson.steps.map((st) => st.id)).toEqual([
      'introduction',
      'flashcards',
      'matching',
      'practice',
      'listening',
      'exam',
    ]);
    expect(() => contentSchema('vocabulary', 'fr').parse(lesson)).not.toThrow();
  });

  it('covers nouns, non-nouns, conjugation and non-conjugation grammar', () => {
    expect(
      load('fr-classroom-objects', 'brief').targets.every((t: Json) => t.wordClass === 'noun'),
    ).toBe(true);
    expect(
      load('fr-classroom-instructions', 'brief').targets.every((t: Json) => t.wordClass !== 'noun'),
    ).toBe(true);
    expect(load('fr-verb-etre-present', 'brief').topic).toBe('verbs_morphology');
    expect(load('fr-negation-ne-pas', 'brief').topic).toBe('negation');
  });

  it.each(FIXTURE_IDS)('%s schemas convert to JSON Schema', (id) => {
    const kind = load(id, 'brief').kind;
    expect(() => z.toJSONSchema(briefSchema(kind, 'fr'))).not.toThrow();
    expect(() => z.toJSONSchema(contentSchema(kind, 'fr'))).not.toThrow();
  });
});

describe('multilingual contract', () => {
  it('rejects partial locale maps', () => {
    expect(checkBrief('fr-classroom-objects', (b) => delete b.objective.de).status).toBe('invalid');
    expect(
      checkContent(
        'fr-verb-etre-present',
        (c) => delete c.steps[1].pages[0].items[0].rows[0].answerExplanation.fr,
      ).status,
    ).toBe('invalid');
    expect(
      checkBrief('fr-classroom-objects', (b) => delete b.targets[0].gap.explanation.fr).status,
    ).toBe('invalid');
  });

  it('requires native translations for every mother tongue except the learning language', () => {
    expect(
      checkBrief('fr-classroom-objects', (b) => delete b.targets[0].translations.de).status,
    ).toBe('invalid');
    expect(
      checkBrief('fr-classroom-objects', (b) => (b.targets[0].translations.fr = ['livre'])).status,
    ).toBe('invalid');
  });

  it('rejects a single nativeLanguage field and older schema versions', () => {
    expect(checkBrief('fr-classroom-objects', (b) => (b.nativeLanguage = 'en')).status).toBe(
      'invalid',
    );
    expect(checkBrief('fr-classroom-objects', (b) => (b.schemaVersion = 1)).status).toBe('invalid');
  });
});

describe('brief validation', () => {
  it('checks outline metadata', () => {
    expect(messages(checkBrief('fr-classroom-objects', (b) => (b.theme = 'travel')))).toMatch(
      /theme: must equal the outline theme education/,
    );
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (b.id = 'fr-family-members'))),
    ).toMatch(/id: must equal/);
  });

  it('checks target counts, groups and noun article rules', () => {
    expect(messages(checkBrief('fr-classroom-objects', (b) => (b.targetCount = 5)))).toMatch(
      /targetCount/,
    );
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => b.groups[0].targetIds.pop())),
    ).toMatch(/exactly one group/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (b.targets[0].examForms = ['le livre']))),
    ).toMatch(/indefinite article/);
    expect(
      messages(
        checkBrief('fr-classroom-instructions', (b) => (b.targets[0].genders = ['masculine'])),
      ),
    ).toMatch(/only nouns have a gender/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (b.targets[0].genderExplanation = null))),
    ).toMatch(/genderExplanation: required for a noun/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-instructions',
          (b) => (b.targets[0].genderExplanation = { en: 'x', fr: 'x', de: 'x' }),
        ),
      ),
    ).toMatch(/only nouns have a gender explanation/);
  });

  it('puts every word into every exercise, with listening choices on pages of their own', () => {
    const brief = load('fr-classroom-instructions', 'brief');
    const lesson = vocabularyLesson(brief);
    const ids = brief.targets.map((t: Json) => t.id).sort();
    const of = (type: string) =>
      lesson.steps
        .flatMap((st) => st.pages.flatMap((pg) => pg.items))
        .filter((it) => it.type === type)
        .map((it) => ('targetId' in it ? it.targetId : ''))
        .sort();
    for (const type of [
      'vocabulary_typed_gap',
      'vocabulary_listening_choice',
      'vocabulary_translation_exam',
      'vocabulary_listening_dictation',
    ])
      expect(of(type), type).toEqual(ids);
    const step = (id: string) => lesson.steps.find((st) => st.id === id)!;
    const practice = [...step('practice').pages, ...step('listening').pages];
    expect(practice.every((pg) => pg.items.length === 1)).toBe(true);
    expect(step('exam').pages.every((pg) => pg.timeLimitS !== null && pg.items.length <= 6)).toBe(
      true,
    );
  });

  it('enforces the French noun article policy in exam forms, teaching forms and exceptions', () => {
    const noun = (b: Json) => b.targets[0]; // un livre, masculine singular
    expect(
      messages(
        checkBrief('fr-classroom-objects', (b) => (noun(b).examForms = ['un livre', 'des livres'])),
      ),
    ).toMatch(/"des livres" uses "des" but a singular masculine noun takes un/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (noun(b).examForms = ['une livre']))),
    ).toMatch(/"une livre" uses "une"/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (noun(b).teachingForm = 'le livre'))),
    ).toMatch(/"le livre" must be one of the exam forms/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (noun(b).teachingForm = 'le livre'))),
    ).toMatch(/teachingForm: "le livre" must include the indefinite article/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (noun(b).genderVariants = ['livre']))),
    ).toMatch(/genderVariants: "livre" must include the indefinite article/);
    expect(
      messages(checkBrief('fr-classroom-objects', (b) => (noun(b).term = 'le livre'))),
    ).toMatch(/"le livre" must be the base term without article/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (noun(b).articleException = { en: 'x', fr: 'x', de: 'x' }),
        ),
      ),
    ).toMatch(/remove the articleException/);
  });

  it('derives exam answers (translation and dictation) only from exam forms', () => {
    const brief = load('fr-classroom-objects', 'brief');
    const exam = vocabularyLesson(brief).steps[6].pages.flatMap((pg) => pg.items);
    for (const item of exam)
      if ('accepted' in item && 'targetId' in item)
        expect(item.accepted.answers).toEqual(
          brief.targets.find((t: Json) => t.id === item.targetId).examForms,
        );
  });

  it('validates formatted introductions and explanations: syntax and locale parity', () => {
    const intro = (b: Json) => b.groups[0].introduction;
    expect(
      messages(
        checkBrief('fr-classroom-objects', (b) => (intro(b).de = '# Titel\n\n' + intro(b).de)),
      ),
    ).toMatch(/introduction\.de: block 1: headings are not allowed/);
    expect(
      messages(
        checkBrief('fr-classroom-objects', (b) => (intro(b).fr = 'Un paragraphe.\n\n- liste')),
      ),
    ).toMatch(/introduction\.fr: block structure p\|ul:1 differs from en/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (intro(b).en = intro(b).en + ' Also `une table`.'),
        ),
      ),
    ).toMatch(/learning-language forms differ/);
    const explanation = (c: Json) => c.steps[0].pages[0].items[0];
    expect(
      messages(
        checkContent('fr-verb-etre-present', (c) => (explanation(c).text.en = '<b>HTML</b>')),
      ),
    ).toMatch(/HTML not allowed/);
  });

  it('requires the lesson length of the derived pages', () => {
    expect(messages(checkBrief('fr-classroom-objects', (b) => (b.estimatedMinutes += 3)))).toMatch(
      /estimatedMinutes/,
    );
  });

  it('checks grammar rule coverage', () => {
    expect(
      messages(checkBrief('fr-verb-etre-present', (b) => (b.blocks[0].ruleIds = ['r-unknown']))),
    ).toMatch(/unknown rule r-unknown/);
    expect(
      messages(checkBrief('fr-verb-etre-present', (b) => (b.exam.pages = [b.exam.pages[1]]))),
    ).toMatch(/does not cover rule r-singular/);
    expect(checkBrief('fr-verb-etre-present', (b) => (b.blocks = [b.blocks[0]])).status).toBe(
      'invalid',
    );
  });

  it('allows pronoun/form exercises only for pronoun and verb topics', () => {
    expect(checkBrief('fr-verb-etre-present').status).toBe('valid');
    const r = checkBrief(
      'fr-negation-ne-pas',
      (b) => (b.blocks[0].exercises[0].type = 'grammar_pronoun_form_match'),
    );
    expect(messages(r)).toMatch(
      /blocks\.0\.exercises\.0\.type: grammar_pronoun_form_match suits only pronouns, verbs_morphology, verb_usage topics, not negation/,
    );
    expect(
      messages(
        checkBrief(
          'fr-negation-ne-pas',
          (b) => (b.exam.pages[0].type = 'grammar_pronoun_form_typing'),
        ),
      ),
    ).toMatch(/exam\.pages\.0\.type: grammar_pronoun_form_typing suits only/);
  });

  it('requires person matching in pronoun and verb-form lessons; boards may review earlier blocks', () => {
    const r = checkBrief('fr-verb-etre-present', (b) => b.blocks[0].exercises.splice(2, 1));
    expect(messages(r)).toMatch(
      /verbs_morphology lessons include a grammar_person_matching exercise/,
    );
    // The plural block may hold a six-row board with the singular rule; other exercises may not.
    expect(
      checkBrief('fr-verb-etre-present', (b) => {
        const board = b.blocks[0].exercises.splice(2, 1)[0];
        b.blocks[1].exercises[0] = { ...board, ruleIds: ['r-singular', 'r-plural'] };
        b.blocks[1].exercises[0].estimatedDurationS = 60;
        b.estimatedMinutes = 9;
      }).status,
    ).toBe('valid');
    expect(
      messages(
        checkBrief(
          'fr-verb-etre-present',
          (b) => (b.blocks[1].exercises[1].ruleIds = ['r-singular']),
        ),
      ),
    ).toMatch(/rule r-singular is not taught in this block$/m);
    expect(
      messages(
        checkBrief(
          'fr-verb-etre-present',
          (b) => (b.blocks[0].exercises[2].ruleIds = ['r-plural']),
        ),
      ),
    ).toMatch(/rule r-plural is not taught in this block or an earlier one/);
    // The imperative (tu, nous, vous only) is exempt.
    const imperative = load('fr-verb-etre-present', 'brief');
    imperative.id = 'fr-imperative-mood';
    imperative.blocks[0].exercises.splice(2, 1);
    expect(messages(validateBrief(imperative, ctx('fr-imperative-mood')))).not.toMatch(
      /grammar_person_matching/,
    );
  });

  it('marks valid briefs from older outline entries as stale', () => {
    const r = validateBrief(load('fr-classroom-objects', 'brief'), {
      ...ctx('fr-classroom-objects'),
      outlineHash: 'another-outline-hash-0000',
    });
    expect(r.status).toBe('stale');
    expect(r.staleReasons).toHaveLength(1);
  });
});

describe('German and English courses', () => {
  const noun = (b: Json) => b.targets[0]; // un livre, masculine singular
  const genderless = (b: Json) => {
    for (const t of b.targets)
      if (t.wordClass === 'noun') {
        t.genders = [];
        t.genderExplanation = null;
      }
  };

  it('needs no gender for an English noun, and rejects one', () => {
    expect(messages(checkBriefAs('en', 'fr-classroom-objects', genderless))).not.toMatch(
      /genders|genderExplanation/,
    );
    expect(messages(checkBriefAs('en', 'fr-classroom-objects'))).toMatch(
      /targets\.0\.genders: en nouns have no gender/,
    );
  });

  it('teaches a German noun with der/die/das', () => {
    const tisch = (form: string) => (b: Json) =>
      Object.assign(noun(b), {
        term: 'Tisch',
        teachingForm: form,
        examForms: [form],
        genderVariants: [],
      });
    expect(messages(checkBriefAs('de', 'fr-classroom-objects', tisch('Tisch')))).toMatch(
      /teachingForm: "Tisch" must include the definite article der\/die\/das/,
    );
    expect(messages(checkBriefAs('de', 'fr-classroom-objects', tisch('die Tisch')))).toMatch(
      /"die Tisch" uses "die" but a singular masculine noun takes der/,
    );
    expect(messages(checkBriefAs('de', 'fr-classroom-objects', tisch('der Tisch')))).not.toMatch(
      /targets\.0\.(teachingForm|examForms|term)/,
    );
  });

  it('has no gender step in an English lesson', () => {
    const brief = asCourse(load('fr-classroom-objects', 'brief'), 'en');
    genderless(brief);
    expect(vocabularyLesson(brief).steps.map((s) => s.id)).not.toContain('overview');
  });

  it('names the course language in the exam, with the article clause only where nouns have a gender', () => {
    expect(examInstruction('de').en).toBe(
      'Translate each word into German, with its article for nouns.',
    );
    expect(examInstruction('en').en).toBe('Translate each word into English.');
    expect(examInstruction('en').de).toBe('Übersetze jedes Wort ins Englische.');
  });

  it('does not require a person board in English verb lessons', () => {
    const r = validateBrief(
      (() => {
        const b = asCourse(load('fr-verb-etre-present', 'brief'), 'en');
        b.blocks[0].exercises.splice(2, 1);
        return b;
      })(),
      { ...ctx('fr-verb-etre-present'), lang: 'en' },
    );
    expect(messages(r)).not.toMatch(/grammar_person_matching/);
  });
});

describe('vocabulary exercise texts in the brief', () => {
  it('checks typed gaps: four distinct references including the word, article-free answers, one fitting reference', () => {
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (b.targets[0].gap.accepted.answers = ['un livre']),
        ),
      ),
    ).toMatch(/article-free/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (b.targets[0].gap.referenceTargetIds = ['chaise', 'chaise', 'stylo', 'table']),
        ),
      ),
    ).toMatch(/four distinct reference targets including the word/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (b.targets[0].gap.accepted.answers = ['livre', 'chaise']),
        ),
      ),
    ).toMatch(/exactly one reference choice may fit/);
  });

  it('accepts "un" as a typed answer only for a numeral', () => {
    const un = (wordClass: string) =>
      messages(
        checkBrief('fr-classroom-instructions', (b) => {
          b.targets[0].wordClass = wordClass;
          b.targets[0].gap.accepted.answers = ['un'];
        }),
      );
    expect(un('numeral')).not.toMatch(/article-free/);
    expect(un('verb')).toMatch(/typed-gap answer "un" must be article-free/);
  });

  it('checks listening options and matching labels', () => {
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (b.targets[0].listeningOptionTargetIds = ['chaise', 'stylo', 'table', 'nope']),
        ),
      ),
    ).toMatch(/four distinct options including the word/);
    expect(
      messages(
        checkBrief(
          'fr-classroom-objects',
          (b) => (b.targets[1].matchingLabel = { en: 'book', de: 'Stuhl' }),
        ),
      ),
    ).toMatch(/duplicate en matching label.* book/);
  });

  it('requires disambiguated exam prompts for words with gender variants', () => {
    const r = checkBrief('fr-classroom-objects', (b) => {
      b.targets[0].genderVariants = ['une livre'];
      b.targets[0].examPrompt = {
        en: b.targets[0].translations.en[0],
        de: b.targets[0].translations.de[0],
      };
    });
    expect(messages(r)).toMatch(/examPrompt: must disambiguate gender/);
  });

  it('requires corrections to name the accent mark', () => {
    expect(
      messages(
        checkBrief(
          'fr-classroom-instructions',
          (b) => (b.targets[0].explanation.en = 'Écoutez is written with é.'),
        ),
      ),
    ).toMatch(/must name the mark/);
  });
});

describe('grammar content validation', () => {
  it('follows the brief block, exercise, feedback and exam sequence', () => {
    expect(messages(checkContent('fr-verb-etre-present', (c) => c.steps.splice(7, 1)))).toMatch(
      /expected \d+ steps/,
    );
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => ([c.steps[1], c.steps[2]] = [c.steps[2], c.steps[1]]),
        ),
      ),
    ).toMatch(/planned exercise/);
  });

  it('validates answer keys of every interaction', () => {
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[2].pages[0].items[0].answerChoiceId = 'c-x'),
        ),
      ),
    ).toMatch(/answerChoiceId/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[2].pages[0].items[0].choices[1].text = 'suis'),
        ),
      ),
    ).toMatch(/duplicate choice text/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[2].pages[0].items[0].after += ' (singulier)'),
        ),
      ),
    ).toMatch(/put cues into hint/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[1].pages[0].items[0].rows[0].validForms = ['sommes']),
        ),
      ),
    ).toMatch(/no token with a valid form/);
    expect(
      messages(
        checkContent('fr-negation-ne-pas', (c) =>
          c.steps[1].pages[0].items[0].acceptedOrders[0].pop(),
        ),
      ),
    ).toMatch(/every token exactly once/);
    expect(
      messages(
        checkContent(
          'fr-negation-ne-pas',
          (c) => (c.steps[4].pages[0].items[0].faultyTokenId = 'w9'),
        ),
      ),
    ).toMatch(/faultyTokenId/);
    expect(
      messages(
        checkContent(
          'fr-negation-ne-pas',
          (c) => (c.steps[4].pages[0].items[0].correction.choices = ['pas', 'non']),
        ),
      ),
    ).toMatch(/select mode/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[9].pages[0].items[0].hint = { en: 'h', fr: 'h', de: 'h' }),
        ),
      ),
    ).toMatch(/no hint/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[6].pages[0].items[0].ruleIds = ['r-x']),
        ),
      ),
    ).toMatch(/unknown rule r-x/);
  });

  it('requires items to assess exactly the planned rules of their exercise or exam page', () => {
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[2].pages[0].items[0].ruleIds = ['r-plural']),
        ),
      ),
    ).toMatch(/rule r-plural is not planned for planned exercise/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[9].pages[0].items[0].ruleIds = ['r-plural']),
        ),
      ),
    ).toMatch(/no item of exam page exam-gaps assesses rule r-singular/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (c.steps[0].pages[0].items[0].ruleIds = ['r-plural']),
        ),
      ),
    ).toMatch(/rule r-plural is not taught in block/);
  });

  it('checks person matching boards: person blocks in order, one mode, unique prompts, one board per page', () => {
    const board = (c: Json) => c.steps[3].pages[0].items[0];
    expect(checkContent('fr-verb-etre-present').status).toBe('valid');
    expect(
      messages(checkContent('fr-verb-etre-present', (c) => (board(c).rows[0].person = '1pl'))),
    ).toMatch(
      /persons must be \[1sg,2sg,3sg\] or \[1pl,2pl,3pl\] or \[1sg,2sg,3sg,1pl,2pl,3pl\] in this order, not \[1pl,2sg,3sg\]/,
    );
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => ([board(c).rows[0], board(c).rows[1]] = [board(c).rows[1], board(c).rows[0]]),
        ),
      ),
    ).toMatch(/in this order/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => (board(c).rows[0].native = { en: 'I', de: 'ich' }),
        ),
      ),
    ).toMatch(/forms rows have a pronoun and no native prompt/);
    expect(
      messages(checkContent('fr-verb-etre-present', (c) => (board(c).rows[1].pronoun = 'je'))),
    ).toMatch(/duplicate pronoun/);
    expect(
      messages(
        checkContent(
          'fr-verb-etre-present',
          (c) => c.steps[3].pages[0].items.push({ ...board(c), itemId: 'second' }),
          (b) => (b.blocks[0].exercises[2].itemCount = 2),
        ),
      ),
    ).toMatch(/each person matching board has a page of its own/);
  });

  it('accepts a repeated pronoun with the same form (English you)', () => {
    const board = (c: Json) => c.steps[3].pages[0].items[0];
    const you = (c: Json) => {
      const rows = board(c).rows;
      rows[1].pronoun = rows[0].pronoun;
      rows[1].answer = rows[0].answer;
    };
    expect(messages(checkContent('fr-verb-etre-present', you))).not.toMatch(/duplicate pronoun/);
  });

  it('keeps the production feedback step a fixed placeholder', () => {
    const r = checkContent('fr-negation-ne-pas', (c) =>
      c.steps[5].pages[0].items.push({
        type: 'production_feedback_placeholder',
        itemId: 'feedback-2',
      }),
    );
    expect(messages(r)).toMatch(/fixed production placeholder/);
  });

  it('requires fresh exam examples: no exam sentence repeats a practice sentence or an explanation example', () => {
    expect(messages(checkContent('fr-negation-ne-pas'))).not.toMatch(/fresh example/);
    const practice = checkContent('fr-negation-ne-pas', (c) => {
      const { tokens, acceptedOrders } = c.steps[1].pages[0].items[0];
      Object.assign(c.steps[6].pages[0].items[0], { tokens, acceptedOrders });
    });
    expect(messages(practice)).toMatch(
      /the exam repeats ".+" from the lesson; use a fresh example/,
    );
    const example = checkContent('fr-negation-ne-pas', (c) => {
      const gap = c.steps[6].pages[1].items[0];
      c.steps[0].pages[0].items[0].examples[0].text = `${gap.before} ${gap.accepted.answers[0]} ${gap.after}.`;
    });
    expect(messages(example)).toMatch(/fresh example/);
  });
});

describe('grammar lesson length', () => {
  const sample = (id: string) => {
    const read = (folder: string) =>
      JSON.parse(readFileSync(join(FIXTURES, 'samples', folder, `${id}.json`), 'utf8'));
    return {
      brief: briefSchema('grammar', 'fr').parse(read('briefs')),
      content: contentSchema('grammar', 'fr').parse(read('lessons')),
    };
  };

  it('passes the complete samples and flags the short fixtures, which stay valid', () => {
    const { brief, content } = sample('fr-verb-etre-present');
    if (brief.kind !== 'grammar' || content.kind !== 'grammar') throw new Error('Expected grammar');
    expect([...grammarBriefLengthIssues(brief), ...grammarContentLengthIssues(content)]).toEqual(
      [],
    );
    expect(checkContent('fr-verb-etre-present').status).toBe('valid');
    const fixture = briefSchema('grammar', 'fr').parse(load('fr-verb-etre-present', 'brief'));
    if (fixture.kind !== 'grammar') throw new Error('Expected grammar');
    expect(
      grammarBriefLengthIssues(fixture)
        .map((i) => i.message)
        .join('\n'),
    ).toMatch(/at least 22[\s\S]*at least 10/);
  });

  it('checks exercises per block, scored units and realistic page estimates', () => {
    const { brief, content } = sample('fr-negation-ne-pas');
    if (brief.kind !== 'grammar' || content.kind !== 'grammar') throw new Error('Expected grammar');
    brief.blocks[1].exercises = brief.blocks[1].exercises.slice(0, 1);
    expect(grammarBriefLengthIssues(brief).map((i) => i.path)).toContain('blocks.1.exercises');
    content.steps[1].pages[0].estimatedDurationS = 200;
    content.steps[0].pages[0].estimatedDurationS = 20;
    const found = grammarContentLengthIssues(content)
      .map((i) => `${i.path}: ${i.message}`)
      .join('\n');
    expect(found).toMatch(/steps\.1\.pages\.0\.estimatedDurationS: 200 s per scored unit/);
    expect(found).toMatch(
      /steps\.0\.pages\.0\.estimatedDurationS: an explanation page takes 45–240 s/,
    );
  });

  it('requires unique new verbs', () => {
    expect(
      messages(checkBrief('fr-verb-etre-present', (b) => b.newVerbs.push(b.newVerbs[0]))),
    ).toMatch(/duplicate infinitive être/);
  });
});
