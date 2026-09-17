import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('loads every item from the fixture directory', async () => {
    await seedQuestionBank(validDir, prisma);

    const rows = await prisma.questionBank.findMany({
      where: { sourceId: { in: seededSourceIds } },
    });
    expect(rows).toHaveLength(seededSourceIds.length);
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

  // Seeds the real content/items rather than a fixture: this is what covers
  // findItemsDir, the walk over all nine files and the authored reading items,
  // none of which the one-item fixtures exercise. It deliberately leaves its
  // rows behind — that is the normal state of a seeded database, and afterEach
  // only targets the 90xx fixture ids.
  it('loads all 270 authored items from the real content directory', async () => {
    await seedQuestionBank(findItemsDir(), prisma);

    const total = await prisma.questionBank.count();
    expect(total).toBeGreaterThanOrEqual(270);

    const byPair = await prisma.questionBank.groupBy({
      by: ['lang', 'category'],
      _count: true,
    });
    expect(byPair).toHaveLength(9);
    for (const pair of byPair) {
      expect(pair._count).toBe(30);
    }
  });
});
