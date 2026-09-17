import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { findItemsDir, seedQuestionBank } from '../prisma/seed';
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

  // Covers findItemsDir and the walk over all nine files, which the one-item
  // fixtures cannot. Every query is scoped to the ids this call wrote: unscoped,
  // a seed that loaded nothing still passed on an already-seeded database, and
  // one unrelated row failed it. Its rows stay behind, which is the normal state
  // of a seeded database; afterEach only targets the 90xx fixture ids.
  it('loads all 270 authored items from the real content directory', async () => {
    const dir = findItemsDir();
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
