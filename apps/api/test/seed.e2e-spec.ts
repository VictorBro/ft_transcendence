import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { findContentDir, seedLessons, seedQuestionBank } from '../prisma/seed';
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

const lessonDraft = (id: string, title: string) => ({
  id,
  kind: 'grammar' as const,
  topic: 'nouns_and_determiners' as const,
  title,
  summary: 'A fixture lesson.',
  brief: {
    objective: 'Pick the right article.',
    points: ['One point.', 'Another point.'],
    examples: ['The cat.', 'A dog.', 'An apple.'],
    pitfalls: ['Mixing them up.'],
  },
});

const lessonFile = (drafts: unknown[]) => ({
  lang: 'en',
  level: 'A1',
  drafts,
});

/**
 * Fixture lessons use `en-test-` ids, which the seed's unknown-id check skips,
 * so one left behind by an interrupted run never blocks a later seed. Every
 * directory also carries the real lesson files: without them, an authored
 * lesson already in the database would count as deleted.
 */
describe('seedLessons (e2e)', () => {
  const FIXTURE_IDS = { startsWith: 'en-test-' };

  let prisma: PrismaService;
  let dir: string;
  let userId: string | undefined;

  async function writeLessonDir(files: Record<string, unknown>): Promise<string> {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir);
    const realDir = findContentDir('lessons');
    for (const name of (await readdir(realDir)).filter((n) => n.endsWith('.json'))) {
      await copyFile(join(realDir, name), join(dir, name));
    }
    for (const [name, content] of Object.entries(files)) {
      await writeFile(
        join(dir, name),
        typeof content === 'string' ? content : JSON.stringify(content),
      );
    }
    return dir;
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
    dir = join(await mkdtemp(join(tmpdir(), 'seed-lessons-')), 'lessons');
  });

  afterEach(async () => {
    // The user first: its results cascade, and Restrict blocks the lessons.
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
      userId = undefined;
    }
    await prisma.lesson.deleteMany({ where: { id: FIXTURE_IDS } });
  });

  afterAll(async () => {
    if (dir !== undefined) {
      await rm(join(dir, '..'), { recursive: true, force: true });
    }
    await prisma?.$disconnect();
  });

  it('maps every column and takes lang, level and position from the file', async () => {
    await writeLessonDir({
      'en-test.json': lessonFile([
        lessonDraft('en-test-first', 'First'),
        lessonDraft('en-test-second', 'Second'),
      ]),
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
      brief: lessonDraft('x', 'x').brief,
    });
  });

  it('writes nothing on a second run, so updatedAt stays the same', async () => {
    await writeLessonDir({
      'en-test.json': lessonFile([lessonDraft('en-test-first', 'First')]),
    });
    await seedLessons(dir, prisma);
    const before = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });

    expect(await seedLessons(dir, prisma)).toBe(0);

    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('keeps the id and the results through a retitle and a reorder', async () => {
    await writeLessonDir({
      'en-test.json': lessonFile([
        lessonDraft('en-test-first', 'First'),
        lessonDraft('en-test-second', 'Second'),
      ]),
    });
    await seedLessons(dir, prisma);
    const userLevelId = await courseWithResult('en-test-first');

    await writeLessonDir({
      'en-test.json': lessonFile([
        lessonDraft('en-test-second', 'Second'),
        lessonDraft('en-test-first', 'First, retitled'),
      ]),
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
    await writeLessonDir({
      'en-test.json': lessonFile([lessonDraft('en-test-first', 'First')]),
    });
    await seedLessons(dir, prisma);
    await courseWithResult('en-test-first');

    await expect(prisma.lesson.delete({ where: { id: 'en-test-first' } })).rejects.toThrow();
    expect(await prisma.lesson.findUnique({ where: { id: 'en-test-first' } })).not.toBeNull();
  });

  it('fails on an id missing from the files, names it, and writes nothing', async () => {
    // Not a test- id, since the check skips those: removed in the finally,
    // so only a crash inside this test can leave it behind.
    const orphan = 'en-seed-orphan';
    await writeLessonDir({
      'en-test.json': lessonFile([lessonDraft('en-test-first', 'First')]),
    });
    await seedLessons(dir, prisma);
    await prisma.lesson.create({
      data: { ...lessonDraft(orphan, 'Orphan'), lang: 'en', level: 'A1', position: 99 },
    });
    try {
      await writeLessonDir({
        'en-test.json': lessonFile([lessonDraft('en-test-first', 'First, edited')]),
      });

      await expect(seedLessons(dir, prisma)).rejects.toThrow(orphan);

      const untouched = await prisma.lesson.findUniqueOrThrow({ where: { id: 'en-test-first' } });
      expect(untouched.title).toBe('First');
    } finally {
      await prisma.lesson.delete({ where: { id: orphan } });
    }
  });

  it('ignores a leftover test- lesson that no file has', async () => {
    await writeLessonDir({
      'en-test.json': lessonFile([lessonDraft('en-test-leftover', 'Leftover')]),
    });
    await seedLessons(dir, prisma);

    await writeLessonDir({});
    await expect(seedLessons(dir, prisma)).resolves.toBeTypeOf('number');
  });

  it('fails naming the file on a malformed lesson file', async () => {
    await writeLessonDir({
      'en-test.json': lessonFile([{ ...lessonDraft('en-test-first', 'First'), topic: undefined }]),
    });
    await expect(seedLessons(dir, prisma)).rejects.toThrow(/en-test\.json/);

    await writeLessonDir({ 'en-test.json': '{ not json' });
    await expect(seedLessons(dir, prisma)).rejects.toThrow(/en-test\.json/);
  });

  it('fails naming both files when two share an id', async () => {
    await writeLessonDir({
      'en-test-a.json': lessonFile([lessonDraft('en-test-twice', 'Twice')]),
      'en-test-b.json': lessonFile([lessonDraft('en-test-twice', 'Twice')]),
    });

    const attempt = seedLessons(dir, prisma);
    await expect(attempt).rejects.toThrow(/en-test-a\.json/);
    await expect(attempt).rejects.toThrow(/en-test-b\.json/);
    expect(await prisma.lesson.findUnique({ where: { id: 'en-test-twice' } })).toBeNull();
  });

  // Today content/lessons holds only .gitkeep, so this is also the empty-
  // directory case. Once lessons land, it checks their positions.
  it('seeds the real content directory with positions 1..N per lang and level', async () => {
    await expect(seedLessons(findContentDir('lessons'), prisma)).resolves.toBeTypeOf('number');

    const rows = await prisma.lesson.findMany({
      select: { id: true, lang: true, level: true, position: true },
      orderBy: { position: 'asc' },
    });
    const byCell = new Map<string, typeof rows>();
    for (const row of rows.filter((r) => !r.id.startsWith(`${r.lang}-test-`))) {
      const key = `${row.lang}-${row.level}`;
      byCell.set(key, [...(byCell.get(key) ?? []), row]);
    }
    for (const cell of byCell.values()) {
      expect(cell.map((row) => row.position)).toEqual(cell.map((_, index) => index + 1));
    }
  });
});
