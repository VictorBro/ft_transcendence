import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ItemFileSchema, LessonDraftFileSchema } from '@ft/shared';

// Same guard as PrismaService: left undefined, node-postgres falls back to its
// own PG* defaults and fails with a misleading localhost connection error.
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is unset: the seed script cannot run. See .env.example.');
  }
  return url;
}

export function findContentDir(kind: 'items' | 'lessons'): string {
  const candidateFromRoot = resolve(process.cwd(), 'content', kind);
  if (existsSync(candidateFromRoot)) {
    return candidateFromRoot;
  }

  const candidateFromApi = resolve(process.cwd(), '../../content', kind);
  if (existsSync(candidateFromApi)) {
    return candidateFromApi;
  }

  throw new Error(
    `content/${kind} not found: looked in ${candidateFromRoot} and ${candidateFromApi}. ` +
      'Run db:seed from the repo root or from apps/api.',
  );
}

/** Returns how many questions were written, so a silent no-op is visible. */
export async function seedQuestionBank(dir: string, prisma: PrismaClient): Promise<number> {
  const allEntries = await readdir(dir);
  const jsonFiles = allEntries.filter((name) => name.endsWith('.json'));

  const operations = [];
  const seenSourceIds = new Map<string, string>();

  for (const fileName of jsonFiles) {
    const fullPath = join(dir, fileName);
    const content = await readFile(fullPath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON in ${fileName}`, { cause: err });
    }

    const result = ItemFileSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid config in ${fileName}: ${result.error.message}`);
    }

    const config = result.data;

    for (const item of config.items) {
      const previousFile = seenSourceIds.get(item.sourceId);
      if (previousFile !== undefined) {
        throw new Error(`Duplicate sourceId "${item.sourceId}" in ${previousFile} and ${fileName}`);
      }
      seenSourceIds.set(item.sourceId, fileName);

      const itemFields = {
        lang: config.lang,
        category: config.category,
        level: item.level,
        topic: item.topic,
        readText: item.readText ?? null,
        question: item.question,
        options: item.options,
        answer: item.answer,
        timeLimitS: item.timeLimitS,
      };

      operations.push(
        prisma.questionBank.upsert({
          where: { sourceId: item.sourceId },
          create: { sourceId: item.sourceId, ...itemFields },
          update: itemFields,
        }),
      );
    }
  }

  await prisma.$transaction(operations);
  return operations.length;
}

/**
 * Returns how many lessons were written: new or changed rows only, so a second
 * run returns 0 and leaves every updatedAt as it was.
 */
export async function seedLessons(dir: string, prisma: PrismaClient): Promise<number> {
  const allEntries = await readdir(dir);
  const jsonFiles = allEntries.filter((name) => name.endsWith('.json'));

  const rows = new Map<string, Prisma.LessonCreateInput>();
  const fileOfId = new Map<string, string>();

  for (const fileName of jsonFiles) {
    const content = await readFile(join(dir, fileName), 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON in ${fileName}`, { cause: err });
    }

    const result = LessonDraftFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid lesson file ${fileName}: ${result.error.message}`);
    }

    const file = result.data;
    file.drafts.forEach((draft, index) => {
      const previousFile = fileOfId.get(draft.id);
      if (previousFile !== undefined) {
        throw new Error(`Duplicate lesson id "${draft.id}" in ${previousFile} and ${fileName}`);
      }
      fileOfId.set(draft.id, fileName);

      rows.set(draft.id, {
        id: draft.id,
        lang: file.lang,
        level: file.level,
        position: index + 1,
        kind: draft.kind,
        topic: draft.topic ?? null,
        theme: draft.theme ?? null,
        title: draft.title,
        summary: draft.summary,
        brief: draft.brief,
      });
    });
  }

  const existing = await prisma.lesson.findMany();

  // `<lang>-test-` ids are spec fixtures (#81, #82, #95). One left behind by an
  // interrupted run must not count as a deleted lesson, or every later seed
  // fails until someone removes it.
  const removed = existing
    .filter((lesson) => !rows.has(lesson.id) && !lesson.id.startsWith(`${lesson.lang}-test-`))
    .map((lesson) => lesson.id);
  if (removed.length > 0) {
    throw new Error(
      `Lessons in the database but in no file: ${removed.join(', ')}. ` +
        'A shipped lesson is edited or moved, never deleted.',
    );
  }

  const existingById = new Map(existing.map((lesson) => [lesson.id, lesson]));
  const writes = [...rows.values()].filter((row) => {
    const current = existingById.get(row.id);
    if (current === undefined) return true;
    // isDeepStrictEqual ignores key order, which jsonb does not keep.
    const { id: _id, updatedAt: _updatedAt, ...currentFields } = current;
    const { id: _rowId, ...rowFields } = row;
    return !isDeepStrictEqual(currentFields, rowFields);
  });

  await prisma.$transaction(
    writes.map((row) => prisma.lesson.upsert({ where: { id: row.id }, create: row, update: row })),
  );
  return writes.length;
}

// Runs only when this file is the entry point, so a test importing
// seedQuestionBank does not seed the real database.
if (require.main === module) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  seedQuestionBank(findContentDir('items'), prisma)
    .then((count) => console.log(`seeded ${count} questions from ${findContentDir('items')}`))
    .then(() => seedLessons(findContentDir('lessons'), prisma))
    .then((count) => console.log(`seeded ${count} lessons from ${findContentDir('lessons')}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
