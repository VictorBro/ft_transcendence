import { describe, expect, it } from 'vitest';

import { LEVELS } from './item';
import {
  FinishLessonSchema,
  FinishResultSchema,
  foldText,
  KIND_COUNTS,
  KIND_SHARES,
  LESSON_KINDS,
  LESSONS_PER_LEVEL,
  LessonCardSchema,
  LessonEntrySchema,
  LessonFileSchema,
  lessonFileName,
  LessonIdSchema,
  LessonOutlineEntrySchema,
  LessonOutlineFileSchema,
  LessonPageSchema,
  LessonQuerySchema,
  outlineFileName,
  TodaySchema,
  type LessonCard,
  type LessonEntry,
  type LessonOutlineEntry,
} from './lesson';

/**
 * The contract itself. The authored files are checked separately, by
 * apps/api/src/lessons/*-files.spec.ts, which need Node to read them.
 */

const grammarEntry: LessonOutlineEntry = {
  id: 'fr-definite-articles',
  kind: 'grammar',
  topic: 'nouns_and_determiners',
  workingTitle: 'Le, la, les',
  intent: "Choisir l'article défini selon le genre et le nombre du nom.",
};

const vocabularyEntry: LessonOutlineEntry = {
  id: 'fr-cafe-drinks',
  kind: 'vocabulary',
  theme: 'food_and_drink',
  workingTitle: 'Au café : les boissons',
  intent: 'Nommer une dizaine de boissons avec leur article.',
};

const brief = {
  objective: 'Choisir le bon article défini.',
  points: ['le devant un nom masculin', 'la devant un nom féminin'],
  examples: ['le café', 'la table', 'les amis'],
  pitfalls: ["l' devant une voyelle"],
};

const vocabulary = ['le café', 'le thé', "l'eau", 'le jus', 'le lait', 'la bière'].map((term) => ({
  term,
  gloss: 'une boisson',
}));

const grammarLesson: LessonEntry = {
  id: 'fr-definite-articles',
  kind: 'grammar',
  topic: 'nouns_and_determiners',
  title: 'Le, la, les',
  summary: 'Choisir le bon article défini selon le genre et le nombre.',
  brief,
};

const vocabularyLesson: LessonEntry = {
  id: 'fr-cafe-drinks',
  kind: 'vocabulary',
  theme: 'food_and_drink',
  title: 'Au café : les boissons',
  summary: 'Commander une boisson au café.',
  brief: { ...brief, vocabulary },
};

const card: LessonCard = {
  id: 'fr-definite-articles',
  level: 'A1',
  position: 2,
  kind: 'grammar',
  topic: 'nouns_and_determiners',
  theme: null,
  title: 'Le, la, les',
  summary: 'Choisir le bon article défini selon le genre et le nombre.',
  status: 'failed',
  score: 55,
  day: '2026-10-12',
  finishedAt: '2026-10-12T07:10:00.000Z',
};

describe('LESSONS_PER_LEVEL, KIND_COUNTS and KIND_SHARES', () => {
  it.each(LEVELS)('%s: the counts add up and stay near the shares', (level) => {
    const counts = KIND_COUNTS[level];
    const total = LESSON_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
    expect(total).toBe(LESSONS_PER_LEVEL[level]);

    for (const kind of LESSON_KINDS) {
      const share = (100 * counts[kind]) / total;
      expect(Math.abs(share - KIND_SHARES[level][kind]), kind).toBeLessThanOrEqual(10);
      expect(share, kind).toBeGreaterThanOrEqual(5);
    }
    expect(LESSON_KINDS.reduce((sum, kind) => sum + KIND_SHARES[level][kind], 0)).toBe(100);
  });
});

describe('LessonIdSchema', () => {
  it('accepts <lang>-<words>', () => {
    for (const id of ['de-separable-verbs', 'fr-greetings', 'en-a']) {
      expect(LessonIdSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const id of [
      'separable-verbs',
      'xx-separable-verbs',
      'de-Separable-verbs',
      'de-separable--verbs',
      'de-separable-verbs-',
      'de-trennbare-verbën',
      'fr-numbers-1-to-10',
      'de_separable_verbs',
      `de-${'a'.repeat(62)}`,
    ]) {
      expect(LessonIdSchema.safeParse(id).success, id).toBe(false);
    }
  });
});

describe('foldText', () => {
  it('lowercases, drops accents and umlauts and spells out the letters NFD cannot split', () => {
    expect(foldText('Élève')).toBe('eleve');
    expect(foldText('Straße')).toBe('strasse');
    expect(foldText('Œuvre')).toBe('oeuvre');
    expect(foldText('Æsthetik')).toBe('aesthetik');
    expect(foldText('Übung')).toBe(foldText('ubung'));
    expect(foldText('Mädchen, schön, Tür')).toBe('madchen, schon, tur');
    expect(foldText('Ça va ?')).toBe('ca va ?');
    // Typed on some keyboards as a plus a combining diaeresis.
    expect(foldText('Ma\u0308dchen')).toBe('madchen');
  });
});

describe('LessonOutlineEntrySchema', () => {
  it('accepts a grammar and a vocabulary entry', () => {
    expect(LessonOutlineEntrySchema.safeParse(grammarEntry).success).toBe(true);
    expect(LessonOutlineEntrySchema.safeParse(vocabularyEntry).success).toBe(true);
  });

  it('rejects a grammar entry without a topic', () => {
    const { topic: _dropped, ...withoutTopic } = grammarEntry;
    expect(LessonOutlineEntrySchema.safeParse(withoutTopic).success).toBe(false);
  });

  it('rejects a vocabulary entry with a topic', () => {
    expect(
      LessonOutlineEntrySchema.safeParse({ ...vocabularyEntry, topic: 'pronouns' }).success,
    ).toBe(false);
  });

  it('rejects a grammar entry with a theme', () => {
    expect(LessonOutlineEntrySchema.safeParse({ ...grammarEntry, theme: 'travel' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown field', () => {
    expect(LessonOutlineEntrySchema.safeParse({ ...grammarEntry, level: 'A1' }).success).toBe(
      false,
    );
  });
});

describe('LessonEntrySchema', () => {
  it('accepts a grammar and a vocabulary lesson', () => {
    expect(LessonEntrySchema.safeParse(grammarLesson).success).toBe(true);
    expect(LessonEntrySchema.safeParse(vocabularyLesson).success).toBe(true);
  });

  it('rejects an empty title and a title given as an object', () => {
    expect(LessonEntrySchema.safeParse({ ...grammarLesson, title: '' }).success).toBe(false);
    expect(
      LessonEntrySchema.safeParse({ ...grammarLesson, title: { fr: 'Le, la, les' } }).success,
    ).toBe(false);
  });

  it('rejects text that is not trimmed, rather than trimming it', () => {
    expect(LessonEntrySchema.safeParse({ ...grammarLesson, title: ' Le, la, les' }).success).toBe(
      false,
    );
    expect(
      LessonEntrySchema.safeParse({
        ...grammarLesson,
        brief: { ...brief, points: ['le ', 'la'] },
      }).success,
    ).toBe(false);
  });

  it('rejects a title or summary over its limit', () => {
    expect(LessonEntrySchema.safeParse({ ...grammarLesson, title: 'a'.repeat(81) }).success).toBe(
      false,
    );
    expect(
      LessonEntrySchema.safeParse({ ...grammarLesson, summary: 'a'.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects a vocabulary lesson without vocabulary', () => {
    expect(LessonEntrySchema.safeParse({ ...vocabularyLesson, brief }).success).toBe(false);
  });

  // Only brief.vocabulary is optional on the other kinds, never the brief itself.
  it('requires the brief on every kind and allows vocabulary on any', () => {
    const { brief: _, ...withoutBrief } = grammarLesson;
    expect(LessonEntrySchema.safeParse(withoutBrief).success).toBe(false);
    expect(
      LessonEntrySchema.safeParse({ ...grammarLesson, brief: { ...brief, vocabulary } }).success,
    ).toBe(true);
  });

  it('bounds the brief lists', () => {
    const tooFew = { ...grammarLesson, brief: { ...brief, examples: ['le café', 'la table'] } };
    expect(LessonEntrySchema.safeParse(tooFew).success).toBe(false);

    const shortVocabulary = {
      ...vocabularyLesson,
      brief: { ...brief, vocabulary: vocabulary.slice(0, 5) },
    };
    expect(LessonEntrySchema.safeParse(shortVocabulary).success).toBe(false);
  });
});

describe('LessonOutlineFileSchema', () => {
  const file = { lang: 'fr', level: 'A1', entries: [vocabularyEntry, grammarEntry] };

  it('accepts a well-formed file', () => {
    expect(LessonOutlineFileSchema.safeParse(file).success).toBe(true);
  });

  it("rejects an id of another language, on that entry's path", () => {
    const result = LessonOutlineFileSchema.safeParse({
      ...file,
      entries: [vocabularyEntry, { ...grammarEntry, id: 'de-definite-articles' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['entries', 1, 'id']);
  });

  it('rejects a duplicate id', () => {
    const result = LessonOutlineFileSchema.safeParse({
      ...file,
      entries: [grammarEntry, { ...vocabularyEntry, id: grammarEntry.id }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['entries', 1, 'id']);
  });

  it('parses the example of the issue', () => {
    const example = {
      lang: 'fr',
      level: 'A1',
      entries: [
        {
          id: 'fr-greetings',
          kind: 'functions',
          theme: 'personal_identification',
          workingTitle: 'Saluer et dire au revoir',
          intent: 'Dire bonjour, salut et au revoir selon la personne et le moment.',
        },
        grammarEntry,
        {
          id: 'fr-er-verbs-present',
          kind: 'grammar',
          topic: 'verbs_morphology',
          workingTitle: 'Le présent des verbes en -er',
          intent: 'Conjuguer parler, habiter et aimer au présent avec tous les pronoms.',
        },
        vocabularyEntry,
        {
          id: 'fr-reading-an-invitation',
          kind: 'reading',
          theme: 'free_time',
          workingTitle: 'Lire une invitation',
          intent: "Trouver le motif, le jour, l'heure et le lieu dans une courte invitation.",
        },
      ],
    };
    expect(LessonOutlineFileSchema.safeParse(example).success).toBe(true);
  });
});

describe('LessonFileSchema', () => {
  const file = { lang: 'fr', level: 'A1', lessons: [grammarLesson, vocabularyLesson] };

  it('accepts a well-formed file', () => {
    expect(LessonFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects an id of another language and a duplicate id', () => {
    expect(LessonFileSchema.safeParse({ ...file, lang: 'de' }).success).toBe(false);
    expect(
      LessonFileSchema.safeParse({ ...file, lessons: [grammarLesson, grammarLesson] }).success,
    ).toBe(false);
  });
});

describe('file names', () => {
  it('name a file after its language and level', () => {
    expect(outlineFileName('de', 'A1')).toBe('de-a1.json');
    expect(lessonFileName('fr', 'C2')).toBe('fr-c2.json');
  });
});

describe('LessonCardSchema', () => {
  it('accepts a started and a never started lesson', () => {
    expect(LessonCardSchema.safeParse(card).success).toBe(true);
    expect(
      LessonCardSchema.safeParse({
        ...card,
        id: 'fr-reading-an-invitation',
        kind: 'reading',
        topic: null,
        theme: 'free_time',
        status: 'todo',
        score: null,
        day: null,
        finishedAt: null,
      }).success,
    ).toBe(true);
  });

  // The brief is the lesson page's, not the list's: a card that still carries
  // it fails, rather than shipping it with every row.
  it('has no brief', () => {
    expect(LessonCardSchema.shape).not.toHaveProperty('brief');
    expect(LessonCardSchema.safeParse({ ...card, brief }).success).toBe(false);
  });

  it('keeps every field, null rather than absent', () => {
    const { theme: _dropped, ...withoutTheme } = card;
    expect(LessonCardSchema.safeParse(withoutTheme).success).toBe(false);
  });

  it('rejects a topic on a reading card and a bad day', () => {
    expect(
      LessonCardSchema.safeParse({ ...card, kind: 'reading', theme: 'free_time' }).success,
    ).toBe(false);
    expect(LessonCardSchema.safeParse({ ...card, day: '12/10/2026' }).success).toBe(false);
  });
});

describe('LessonQuerySchema', () => {
  const defaults = {
    q: '',
    status: [],
    kind: [],
    topic: [],
    theme: [],
    sort: 'position',
    dir: 'asc',
    group: 'none',
    page: 1,
  };

  it('defaults every field', () => {
    expect(LessonQuerySchema.parse({})).toEqual(defaults);
  });

  it('falls back to the defaults and drops unknown list values', () => {
    expect(LessonQuerySchema.parse({ sort: 'foo', kind: 'grammar,foo', page: '0' })).toEqual({
      ...defaults,
      kind: ['grammar'],
    });
  });

  it('reads a full query', () => {
    expect(
      LessonQuerySchema.parse({
        q: '  articles ',
        status: 'failed,todo,failed',
        topic: 'pronouns',
        theme: 'travel,weather',
        sort: 'score',
        dir: 'desc',
        group: 'day',
        page: '3',
      }),
    ).toEqual({
      q: 'articles',
      status: ['failed', 'todo'],
      kind: [],
      topic: ['pronouns'],
      theme: ['travel', 'weather'],
      sort: 'score',
      dir: 'desc',
      group: 'day',
      page: 3,
    });
  });

  it('cuts q to 100 characters instead of rejecting it', () => {
    expect(LessonQuerySchema.parse({ q: 'a'.repeat(150) }).q).toHaveLength(100);
  });
});

describe('FinishLessonSchema', () => {
  it('accepts whole scores from 0 to 100', () => {
    for (const score of [0, 70, 100]) {
      expect(FinishLessonSchema.safeParse({ score }).success, `${score}`).toBe(true);
    }
  });

  it('rejects anything else with lesson.invalidScore', () => {
    for (const input of [{ score: 101 }, { score: -1 }, { score: 70.5 }, { score: '70' }, {}]) {
      const result = FinishLessonSchema.safeParse(input);
      expect(result.success, JSON.stringify(input)).toBe(false);
      expect(result.error?.issues.map((i) => i.message)).toEqual(['lesson.invalidScore']);
    }
  });
});

describe('TodaySchema', () => {
  // GET /api/courses/fr/today from #81: French A1, goal 30, one failed redo so far.
  const today = {
    day: '2026-10-12',
    target: 3,
    met: false,
    done: [card],
    proposed: [],
    extra: [],
    streak: { current: 2, best: 2, today: false },
    progress: { total: 120, attempted: 4, passed: 2, needed: 96, complete: false },
    levelAfter: 'A2',
  };

  it('accepts a day, and a last level with nothing after it', () => {
    expect(TodaySchema.safeParse(today).success).toBe(true);
    expect(TodaySchema.safeParse({ ...today, levelAfter: null }).success).toBe(true);
  });

  it('keeps every field, null rather than absent', () => {
    const { levelAfter: _dropped, ...withoutLevelAfter } = today;
    expect(TodaySchema.safeParse(withoutLevelAfter).success).toBe(false);
  });

  it('rejects a card that carries its brief', () => {
    expect(TodaySchema.safeParse({ ...today, done: [{ ...card, brief }] }).success).toBe(false);
  });
});

describe('LessonPageSchema', () => {
  const page = {
    day: '2026-10-12',
    levelTotal: 120,
    items: [card],
    total: 1,
    page: 1,
    pageSize: 20,
  };

  it('accepts a page of cards', () => {
    expect(LessonPageSchema.safeParse(page).success).toBe(true);
    expect(LessonPageSchema.safeParse({ ...page, items: [], total: 0 }).success).toBe(true);
  });

  it('rejects page 0 and a bad day', () => {
    expect(LessonPageSchema.safeParse({ ...page, page: 0 }).success).toBe(false);
    expect(LessonPageSchema.safeParse({ ...page, day: '2026-10-12T00:00:00Z' }).success).toBe(
      false,
    );
  });
});

describe('FinishResultSchema', () => {
  const result = { countedToday: true, doneCount: 3, target: 3, goalJustMet: true };

  it('accepts the result of a finish', () => {
    expect(FinishResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects a missing field and a negative count', () => {
    const { goalJustMet: _dropped, ...withoutGoal } = result;
    expect(FinishResultSchema.safeParse(withoutGoal).success).toBe(false);
    expect(FinishResultSchema.safeParse({ ...result, doneCount: -1 }).success).toBe(false);
  });
});
