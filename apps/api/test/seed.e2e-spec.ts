import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LEARNABLE_LANGUAGES, LESSONS_PER_LEVEL, LEVELS, type Level } from '@ft/shared';

import {
  demoPassword,
  demoSkipReason,
  findContentDir,
  seedLessons,
  seedQuestionBank,
} from '../prisma/seed';
import { PrismaService } from '../src/prisma/prisma.service';

const itemFile = (question: string) => ({
  lang: 'en',
  category: 'grammar',
  items: [
    {
      sourceId: 'en-gram-9001',
      level: 'A1',
      topic: 'verbs_morphology',
      question,
      options: ['walk', 'walks', 'walking', 'walked'],
      answer: 'walks',
      timeLimitS: 30,
    },
  ],
});

async function readAuthoredItems(dir: string): Promise<{ sourceId: string }[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  const items: { sourceId: string }[] = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(dir, file), 'utf-8')) as {
      items: { sourceId: string }[];
    };
    items.push(...parsed.items);
  }
  return items;
}

/**
 * Needs a real Postgres: the acceptance criteria on issue #43 are about what
 * ends up in QuestionBank after running the script twice, which a mocked
 * client cannot show.
 */
describe('seedQuestionBank (e2e)', () => {
  const validDir = join(__dirname, 'fixtures/seed-valid');
  const invalidDir = join(__dirname, 'fixtures/seed-invalid');
  const duplicateDir = join(__dirname, 'fixtures/seed-duplicate');

  const seededSourceIds = ['en-gram-9001'];
  const cleanupSourceIds = [...seededSourceIds, 'en-gram-9002'];

  let prisma: PrismaService;
  let editableDir: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    editableDir = await mkdtemp(join(tmpdir(), 'seed-editable-'));
  });

  afterEach(async () => {
    await prisma.questionBank.deleteMany({ where: { sourceId: { in: cleanupSourceIds } } });
  });

  afterAll(async () => {
    if (editableDir !== undefined) {
      await rm(editableDir, { recursive: true, force: true });
    }
    await prisma?.$disconnect();
  });

  it('loads every item from the fixture directory, with every column mapped', async () => {
    await seedQuestionBank(validDir, prisma);

    const rows = await prisma.questionBank.findMany({
      where: { sourceId: { in: seededSourceIds } },
    });
    expect(rows).toHaveLength(seededSourceIds.length);

    // The whole row, not just the count: a field read from the wrong key still
    // writes one row, and the exam is what breaks.
    expect(rows[0]).toMatchObject({
      lang: 'en',
      category: 'grammar',
      level: 'A1',
      topic: 'verbs_morphology',
      readText: null,
      question: 'She ___ to school every day.',
      options: ['walk', 'walks', 'walking', 'walked'],
      answer: 'walks',
      timeLimitS: 30,
    });
  });

  it('running it twice leaves the same row count and id (idempotent upsert)', async () => {
    await seedQuestionBank(validDir, prisma);
    const before = await prisma.questionBank.findUniqueOrThrow({
      where: { sourceId: 'en-gram-9001' },
    });

    await seedQuestionBank(validDir, prisma);

    const rows = await prisma.questionBank.findMany({
      where: { sourceId: { in: seededSourceIds } },
    });
    expect(rows).toHaveLength(seededSourceIds.length);
    expect(rows[0].id).toBe(before.id);
  });

  it('re-seeding after editing the JSON updates the row and keeps its id', async () => {
    await writeFile(join(editableDir, 'en-grammar.json'), JSON.stringify(itemFile('Original?')));
    await seedQuestionBank(editableDir, prisma);
    const before = await prisma.questionBank.findUniqueOrThrow({
      where: { sourceId: 'en-gram-9001' },
    });

    await writeFile(join(editableDir, 'en-grammar.json'), JSON.stringify(itemFile('Edited?')));
    await seedQuestionBank(editableDir, prisma);
    const after = await prisma.questionBank.findUniqueOrThrow({
      where: { sourceId: 'en-gram-9001' },
    });

    expect(after.id).toBe(before.id);
    expect(after.question).toBe('Edited?');
  });

  it('fails loudly, naming the file and the reason, on a malformed item file', async () => {
    const attempt = seedQuestionBank(invalidDir, prisma);

    await expect(attempt).rejects.toThrow(/en-grammar\.json/);
    await expect(attempt).rejects.toThrow(/options/);
    await expect(attempt).rejects.toThrow(/expected array to have >=4 items/);
  });

  it('fails before writing when two files share a sourceId', async () => {
    await expect(seedQuestionBank(duplicateDir, prisma)).rejects.toThrow(/en-gram-9002/);
    await expect(seedQuestionBank(duplicateDir, prisma)).rejects.toThrow(/en-grammar-a\.json/);
    await expect(seedQuestionBank(duplicateDir, prisma)).rejects.toThrow(/en-grammar-b\.json/);

    const row = await prisma.questionBank.findUnique({ where: { sourceId: 'en-gram-9002' } });
    expect(row).toBeNull();
  });

  // Covers findContentDir and the walk over all nine files, which the one-item
  // fixtures cannot. Every query is scoped to the ids this call wrote: unscoped,
  // a seed that loaded nothing still passed on an already-seeded database, and
  // one unrelated row failed it. Its rows stay behind, which is the normal state
  // of a seeded database; afterEach only targets the 90xx fixture ids.
  it('loads all 270 authored items from the real content directory', async () => {
    const dir = findContentDir('items');
    const authored = await readAuthoredItems(dir);
    expect(authored).toHaveLength(270);
    const where = { sourceId: { in: authored.map((item) => item.sourceId) } };

    // Compared before and after, because the rows survive between runs: merely
    // counting them proves a previous seed, not this one. Not deleting them
    // first, because UserSeenQuestion cascades off these ids and keeping it
    // valid across re-seeds is the reason the script upserts at all.
    const stamps = new Map(
      (
        await prisma.questionBank.findMany({ where, select: { sourceId: true, updatedAt: true } })
      ).map((row) => [row.sourceId, row.updatedAt]),
    );

    expect(await seedQuestionBank(dir, prisma)).toBe(authored.length);

    const touched = await prisma.questionBank.findMany({
      where,
      select: { sourceId: true, updatedAt: true },
    });
    expect(touched).toHaveLength(authored.length);
    const stale = touched.filter((row) => {
      const previous = stamps.get(row.sourceId);
      return previous !== undefined && row.updatedAt <= previous;
    });
    expect(stale).toEqual([]);

    const byPair = await prisma.questionBank.groupBy({
      by: ['lang', 'category'],
      where,
      _count: true,
    });
    expect(byPair).toHaveLength(9);
    for (const pair of byPair) {
      expect(pair._count).toBe(30);
    }

    // The fixtures are all grammar, so this is the only place readText is
    // written from a real value rather than from undefined.
    const reading = await prisma.questionBank.findMany({
      where: { ...where, category: 'reading' },
    });
    expect(reading).toHaveLength(90);
    expect(reading.every((row) => row.readText !== null && row.readText !== '')).toBe(true);

    const rest = await prisma.questionBank.findMany({
      where: { ...where, category: { not: 'reading' } },
    });
    expect(rest).toHaveLength(180);
    expect(rest.every((row) => row.readText === null)).toBe(true);
  });
});

const outlineEntry = (id: string, workingTitle: string) => ({
  id,
  kind: 'grammar' as const,
  topic: 'nouns_and_determiners' as const,
  workingTitle,
  intent: 'A fixture lesson.',
});

const outlineFile = (entries: unknown[], lang = 'en') => ({
  lang,
  level: 'A1',
  entries,
});

/**
 * One complete lesson of each kind, from the fixtures of @ft/shared, renamed
 * `fr-test-<kind>` so the seed's unknown-id check skips them. The vocabulary
 * lesson is a brief alone; the others have a content file.
 */
const SHARED_FIXTURES = join(__dirname, '../../../packages/shared/test/fixtures');
const LESSON_FIXTURES = [
  { from: 'content', source: 'fr-classroom-objects', kind: 'vocabulary', theme: 'education' },
  { from: 'samples', source: 'fr-verb-etre-present', kind: 'grammar', topic: 'verbs_morphology' },
  { from: 'samples', source: 'fr-ordering-at-a-cafe', kind: 'functions', theme: 'food_and_drink' },
  { from: 'samples', source: 'fr-reading-a-text-message', kind: 'reading', theme: 'daily_life' },
] as const;

interface LessonFiles {
  id: string;
  entry: Record<string, unknown>;
  brief: Record<string, unknown> & { title: string; objective: { fr: string } };
  content: Record<string, unknown> | undefined;
}

async function lessonFiles(): Promise<LessonFiles[]> {
  return Promise.all(
    LESSON_FIXTURES.map(async ({ from, source, ...classification }) => {
      const id = `fr-test-${classification.kind}`;
      const read = async (folder: string) => {
        const path = join(SHARED_FIXTURES, from, folder, `${source}.json`);
        return { ...JSON.parse(await readFile(path, 'utf-8')), id };
      };
      return {
        id,
        entry: { id, ...classification, workingTitle: `Planned ${id}`, intent: 'Planned.' },
        brief: await read('briefs'),
        content: classification.kind === 'vocabulary' ? undefined : await read('lessons'),
      };
    }),
  );
}

/**
 * Fixture lessons use `<lang>-test-` ids, which the seed's unknown-id check
 * skips, so one left behind by an interrupted run never blocks a later seed.
 * Every content folder also carries the real outline and lesson files:
 * without the outlines, an outlined lesson already in the database would
 * count as deleted, and without the lesson files, a ready one would be
 * reseeded as not ready.
 */
describe('seedLessons (e2e)', () => {
  const FIXTURE_IDS = {
    OR: [{ id: { startsWith: 'en-test-' } }, { id: { startsWith: 'fr-test-' } }],
  };

  let prisma: PrismaService;
  let dir: string;
  let userId: string | undefined;

  /** Writes a content folder: the real files plus `outlines`, `briefs` and `lessons`, by file name. */
  async function writeContentDir(files: {
    outlines?: Record<string, unknown>;
    briefs?: Record<string, unknown>;
    lessons?: Record<string, unknown>;
  }): Promise<string> {
    await rm(dir, { recursive: true, force: true });
    for (const folder of ['outlines', 'briefs', 'lessons'] as const) {
      await mkdir(join(dir, folder), { recursive: true });
    }
    const realDir = dirname(findContentDir('outlines'));
    for (const folder of ['outlines', 'briefs', 'lessons'] as const) {
      for (const name of (await readdir(join(realDir, folder))).filter((n) =>
        n.endsWith('.json'),
      )) {
        await copyFile(join(realDir, folder, name), join(dir, folder, name));
      }
    }
    for (const folder of ['outlines', 'briefs', 'lessons'] as const) {
      for (const [name, content] of Object.entries(files[folder] ?? {})) {
        await writeFile(
          join(dir, folder, name),
          typeof content === 'string' ? content : JSON.stringify(content),
        );
      }
    }
    return dir;
  }

  /** A content folder with the four fixture lessons, edited by `edit` first. */
  async function writeLessons(edit?: (lessons: LessonFiles[]) => void): Promise<LessonFiles[]> {
    const lessons = await lessonFiles();
    edit?.(lessons);
    await writeContentDir({
      outlines: {
        'fr-test.json': outlineFile(
          lessons.map((l) => l.entry),
          'fr',
        ),
      },
      briefs: Object.fromEntries(lessons.map((l) => [`${l.id}.json`, l.brief])),
      lessons: Object.fromEntries(
        lessons.filter((l) => l.content).map((l) => [`${l.id}.json`, l.content]),
      ),
    });
    return lessons;
  }

  async function courseWithResult(lessonId: string): Promise<string> {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `seed-${suffix}@example.test`,
        displayName: `seed-${suffix}`,
        passwordHash: 'unused',
        userLevels: { create: { lang: 'en', level: 'A1', dailyGoal: 10 } },
      },
      include: { userLevels: true },
    });
    userId = user.id;
    const userLevelId = user.userLevels[0].id;
    await prisma.lessonResult.create({
      data: {
        userLevelId,
        lessonId,
        score: 55,
        day: new Date('2026-10-12'),
        finishedAt: new Date('2026-10-12T07:10:00Z'),
      },
    });
    return userLevelId;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    dir = join(await mkdtemp(join(tmpdir(), 'seed-lessons-')), 'content');
    // make ci migrates but does not seed: without this, the first test would
    // also count every outlined lesson as written.
    await seedLessons(dirname(findContentDir('outlines')), prisma);
  });

  afterEach(async () => {
    // The user first: its results cascade, and Restrict blocks the lessons.
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
      userId = undefined;
    }
    await prisma.lesson.deleteMany({ where: FIXTURE_IDS });
  });

  afterAll(async () => {
    if (dir !== undefined) {
      await rm(join(dir, '..'), { recursive: true, force: true });
    }
    await prisma?.$disconnect();
  });

  it('maps an outline entry to a lesson, with lang, level and position from the file', async () => {
    await writeContentDir({
      outlines: {
        'en-test.json': outlineFile([
          outlineEntry('en-test-first', 'First'),
          outlineEntry('en-test-second', 'Second'),
        ]),
      },
    });

    expect(await seedLessons(dir, prisma)).toBe(2);

    const row = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-second' } });
    expect(row).toMatchObject({
      lang: 'en',
      level: 'A1',
      position: 2,
      kind: 'grammar',
      topic: 'nouns_and_determiners',
      theme: null,
      title: 'Second',
      summary: 'A fixture lesson.',
      content: null,
      ready: false,
    });
    // Not in toMatchObject: there, {} matches any object.
    expect(row.brief).toEqual({});
  });

  it('writes nothing on a second run, so updatedAt stays the same', async () => {
    await writeContentDir({
      outlines: { 'en-test.json': outlineFile([outlineEntry('en-test-first', 'First')]) },
    });
    await seedLessons(dir, prisma);
    const before = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });

    expect(await seedLessons(dir, prisma)).toBe(0);

    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('keeps the id and the results through a retitle and a reorder', async () => {
    await writeContentDir({
      outlines: {
        'en-test.json': outlineFile([
          outlineEntry('en-test-first', 'First'),
          outlineEntry('en-test-second', 'Second'),
        ]),
      },
    });
    await seedLessons(dir, prisma);
    const userLevelId = await courseWithResult('en-test-first');

    await writeContentDir({
      outlines: {
        'en-test.json': outlineFile([
          outlineEntry('en-test-second', 'Second'),
          outlineEntry('en-test-first', 'First, retitled'),
        ]),
      },
    });
    expect(await seedLessons(dir, prisma)).toBe(2);

    const moved = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });
    expect(moved).toMatchObject({ title: 'First, retitled', position: 2 });
    const result = await prisma.lessonResult.findUniqueOrThrow({
      where: { userLevelId_lessonId: { userLevelId, lessonId: 'en-test-first' } },
    });
    expect(result.score).toBe(55);
  });

  it('refuses to delete a lesson that has a result (Restrict)', async () => {
    await writeContentDir({
      outlines: { 'en-test.json': outlineFile([outlineEntry('en-test-first', 'First')]) },
    });
    await seedLessons(dir, prisma);
    await courseWithResult('en-test-first');

    await expect(prisma.lesson.delete({ where: { id: 'en-test-first' } })).rejects.toThrow();
    expect(await prisma.lesson.findUnique({ where: { id: 'en-test-first' } })).not.toBeNull();
  });

  it('fails on an entry removed from the outlines, names it, and writes nothing', async () => {
    // Not a test- id, since the check skips those: removed in the finally,
    // so only a crash inside this test can leave it behind.
    const orphan = 'en-seed-orphan';
    await writeContentDir({
      outlines: {
        'en-test.json': outlineFile([
          outlineEntry('en-test-first', 'First'),
          outlineEntry(orphan, 'Orphan'),
        ]),
      },
    });
    await seedLessons(dir, prisma);
    try {
      await writeContentDir({
        outlines: {
          'en-test.json': outlineFile([outlineEntry('en-test-first', 'First, edited')]),
        },
      });

      await expect(seedLessons(dir, prisma)).rejects.toThrow(orphan);

      const untouched = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });
      expect(untouched.title).toBe('First');
    } finally {
      await prisma.lesson.delete({ where: { id: orphan } });
    }
  });

  it('ignores a leftover test- lesson that no file has', async () => {
    await writeContentDir({
      outlines: { 'en-test.json': outlineFile([outlineEntry('en-test-leftover', 'Leftover')]) },
    });
    await seedLessons(dir, prisma);

    await writeContentDir({});
    await expect(seedLessons(dir, prisma)).resolves.toBeTypeOf('number');
  });

  it('fails naming the file on a malformed outline file', async () => {
    await writeContentDir({
      outlines: {
        'en-test.json': outlineFile([
          { ...outlineEntry('en-test-first', 'First'), topic: undefined },
        ]),
      },
    });
    await expect(seedLessons(dir, prisma)).rejects.toThrow(/en-test\.json/);

    await writeContentDir({ outlines: { 'en-test.json': '{ not json' } });
    await expect(seedLessons(dir, prisma)).rejects.toThrow(/en-test\.json/);
  });

  it('fails naming both files when two share an id', async () => {
    await writeContentDir({
      outlines: {
        'en-test-a.json': outlineFile([outlineEntry('en-test-twice', 'Twice')]),
        'en-test-b.json': outlineFile([outlineEntry('en-test-twice', 'Twice')]),
      },
    });

    const attempt = seedLessons(dir, prisma);
    await expect(attempt).rejects.toThrow(/en-test-a\.json/);
    await expect(attempt).rejects.toThrow(/en-test-b\.json/);
    expect(await prisma.lesson.findUnique({ where: { id: 'en-test-twice' } })).toBeNull();
  });

  it('loads a written lesson of each kind: title, summary, brief and content from its files', async () => {
    const lessons = await writeLessons();

    expect(await seedLessons(dir, prisma)).toBe(4);

    for (const lesson of lessons) {
      const row = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
      expect(row, lesson.id).toMatchObject({
        lang: 'fr',
        level: 'A1',
        kind: lesson.entry.kind,
        title: lesson.brief.title,
        summary: lesson.brief.objective.fr,
        ready: true,
      });
      // The fixtures are already trimmed, so the parsed files equal the raw ones.
      expect(row.brief, lesson.id).toEqual(lesson.brief);
      expect(row.content, lesson.id).toEqual(lesson.content ?? null);
    }
  });

  it('writes nothing on a second run of written lessons', async () => {
    await writeLessons();
    await seedLessons(dir, prisma);

    expect(await seedLessons(dir, prisma)).toBe(0);
  });

  it('makes a lesson not ready when its files are removed, and ready again when they are back', async () => {
    const lessons = await writeLessons();
    await seedLessons(dir, prisma);
    const grammar = lessons.find((lesson) => lesson.entry.kind === 'grammar')!;
    const readyOf = async (id: string) =>
      (await prisma.lesson.findUniqueOrThrow({ where: { id } })).ready;

    await rm(join(dir, 'briefs', `${grammar.id}.json`));
    await rm(join(dir, 'lessons', `${grammar.id}.json`));
    expect(await seedLessons(dir, prisma)).toBe(1);

    const removed = await prisma.lesson.findUniqueOrThrow({ where: { id: grammar.id } });
    expect(removed).toMatchObject({
      ready: false,
      title: grammar.entry.workingTitle,
      content: null,
    });
    expect(removed.brief).toEqual({});
    for (const other of lessons.filter((lesson) => lesson !== grammar)) {
      expect(await readyOf(other.id), other.id).toBe(true);
    }

    await writeLessons();
    expect(await seedLessons(dir, prisma)).toBe(1);
    expect(await readyOf(grammar.id)).toBe(true);
  });

  it('stores the parsed files: the texts trimmed', async () => {
    await writeLessons((lessons) => {
      for (const lesson of lessons) {
        lesson.brief.title = `  ${lesson.brief.title}  `;
        if (lesson.content) lesson.content.title = lesson.brief.title;
      }
    });
    await seedLessons(dir, prisma);

    const row = await prisma.lesson.findUniqueOrThrow({ where: { id: 'fr-test-reading' } });
    expect(row.title).toBe('Lire un SMS');
    expect((row.brief as { title: string }).title).toBe('Lire un SMS');
  });

  it('fails on an invalid lesson, names its id and the issue, and writes nothing', async () => {
    await writeLessons((lessons) => {
      lessons[1].brief.title = 'a'.repeat(81);
    });

    const attempt = seedLessons(dir, prisma);
    await expect(attempt).rejects.toThrow(/Invalid lesson fr-test-grammar/);
    await expect(attempt).rejects.toThrow(/brief\.title: Too big/);
    expect(await prisma.lesson.findMany({ where: FIXTURE_IDS })).toEqual([]);
  });

  // validateBrief and validateContent alone accept this one: only the length rules stop it.
  it('fails on a grammar lesson too short for the length rules', async () => {
    const short = async (folder: string) => ({
      ...JSON.parse(
        await readFile(
          join(SHARED_FIXTURES, 'content', folder, 'fr-verb-etre-present.json'),
          'utf-8',
        ),
      ),
      id: 'fr-test-grammar',
    });
    const brief = await short('briefs');
    const content = await short('lessons');
    await writeLessons((lessons) => {
      lessons[1].brief = brief;
      lessons[1].content = content;
    });

    const attempt = seedLessons(dir, prisma);
    await expect(attempt).rejects.toThrow(/Invalid lesson fr-test-grammar/);
    await expect(attempt).rejects.toThrow(/GRAMMAR_LENGTH/);
  });

  it('fails on a lesson file that no outline entry plans, and on a content file without its brief', async () => {
    await writeContentDir({ briefs: { 'fr-test-stray.json': {} } });
    await expect(seedLessons(dir, prisma)).rejects.toThrow(/briefs\/fr-test-stray\.json/);

    await writeLessons();
    await rm(join(dir, 'briefs', 'fr-test-functions.json'));
    await expect(seedLessons(dir, prisma)).rejects.toThrow(
      /lessons\/fr-test-functions\.json \(it has no brief\)/,
    );
  });

  it('seeds every outline entry, with positions 1..N per lang and level', async () => {
    await expect(seedLessons(dirname(findContentDir('outlines')), prisma)).resolves.toBe(0);

    const rows = await prisma.lesson.findMany({
      select: { id: true, lang: true, level: true, position: true },
      orderBy: { position: 'asc' },
    });
    const byCell = new Map<string, typeof rows>();
    for (const row of rows.filter((r) => !r.id.startsWith(`${r.lang}-test-`))) {
      const key = `${row.lang}-${row.level}`;
      byCell.set(key, [...(byCell.get(key) ?? []), row]);
    }
    expect(byCell.size).toBe(LEARNABLE_LANGUAGES.length * LEVELS.length);
    for (const [key, cell] of byCell) {
      const level = key.slice(key.indexOf('-') + 1) as Level;
      expect(cell).toHaveLength(LESSONS_PER_LEVEL[level]);
      expect(cell.map((row) => row.position)).toEqual(cell.map((_, index) => index + 1));
    }
  });

  // Today French A1 positions 1 to 12. Read off the files rather than
  // hard-coded, so a content PR does not have to edit this test.
  it('makes ready exactly the lessons that have files, and no other', async () => {
    const contentDir = dirname(findContentDir('outlines'));
    await seedLessons(contentDir, prisma);

    const withFiles = (await readdir(join(contentDir, 'briefs')))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
    const ready = await prisma.lesson.findMany({
      where: { ready: true },
      select: { id: true, lang: true },
    });
    // Any language's `-test-` fixture, as the seed skips them: one left by an
    // interrupted lessons or finish spec is ready too.
    const real = ready.filter((row) => !row.id.startsWith(`${row.lang}-test-`));
    // Sorted here, like withFiles: the database's collation ignores the hyphens.
    expect(real.map((row) => row.id).sort()).toEqual(withFiles);
  });
});

/**
 * The gate of the demo learners (#85). Pure, so no database: each case is a
 * hand-made env, and process.env is never touched.
 */
describe('demoSkipReason', () => {
  const PASSWORD = 'Correct-Horse-9';

  it('seeds them on development with a password', () => {
    expect(demoSkipReason({ NODE_ENV: 'development', DEMO_PASSWORD: PASSWORD })).toBeNull();
  });

  // An allowlist: the deploy's migrate service seeds with only DATABASE_URL.
  it('skips them when NODE_ENV is unset, like on the public server', () => {
    expect(demoSkipReason({ DATABASE_URL: 'postgresql://x', DEMO_PASSWORD: PASSWORD })).toBe(
      'NODE_ENV is unset, not development',
    );
  });

  it.each(['production', 'test', 'Development', ''])('skips them when NODE_ENV is "%s"', (env) => {
    expect(demoSkipReason({ NODE_ENV: env, DEMO_PASSWORD: PASSWORD })).toMatch(/not development$/);
  });

  // Every .env has the key, empty by default: empty is a skip, never a failure.
  it.each([undefined, '', '   '])('skips them when DEMO_PASSWORD is %j', (password) => {
    expect(demoSkipReason({ NODE_ENV: 'development', DEMO_PASSWORD: password })).toBe(
      'DEMO_PASSWORD is empty',
    );
  });
});

describe('demoPassword', () => {
  it('returns a password that passes the signup rules, unchanged', () => {
    expect(demoPassword({ DEMO_PASSWORD: 'Correct-Horse-9' })).toBe('Correct-Horse-9');
  });

  it.each([
    ['too short', 'Short-9', 'password.tooShort'],
    ['no uppercase', 'correct-horse-9', 'password.needsUppercase'],
    ['no digit', 'Correct-Horse-Battery', 'password.needsDigit'],
  ])(
    'fails the seed on a password with %s, naming the rule but never the value',
    (_, password, code) => {
      let message = '';
      try {
        demoPassword({ DEMO_PASSWORD: password });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(code);
      expect(message).not.toContain(password);
    },
  );
});
