import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { ItemFileSchema, LessonOutlineFileSchema, lessons, PasswordSchema } from '@ft/shared';
import { PrismaService } from '../src/prisma/prisma.service';

export function findContentDir(kind: 'items' | 'lessons' | 'outlines'): string {
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

async function readJson(path: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${name}`, { cause: err });
  }
}

/** The `.json` files of a folder, without the extension: `fr-greetings.json` → `fr-greetings`. */
async function jsonIds(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length));
}

/**
 * A lesson row as compared with the database: content is null here, and
 * becomes Prisma.DbNull only when written, or every run would see a change.
 */
type LessonRow = Omit<Prisma.LessonCreateInput, 'content'> & {
  content: Prisma.InputJsonValue | null;
};

/**
 * Seeds one Lesson row per outline entry, from a content folder:
 *
 *   outlines/<lang>-<level>.json   the entries: id, kind, place, working title
 *   briefs/<id>.json               the lesson's brief, once written
 *   lessons/<id>.json              its content, for every kind but vocabulary
 *
 * An entry without files gets its working title and intent, an empty brief,
 * no content, and ready false. An entry with files must pass validateLesson,
 * and then takes its title, summary, brief and content from them, and ready
 * true. A file that no entry plans, or an invalid lesson, stops the seed
 * before anything is written.
 *
 * ready is set on every run, from the files alone: a lesson becomes ready by
 * adding its files and reseeding, and stops being ready when they are
 * removed. No migration, and no row deleted.
 *
 * Returns how many lessons were written: new or changed rows only, so a second
 * run returns 0 and leaves every updatedAt as it was.
 */
export async function seedLessons(contentDir: string, prisma: PrismaClient): Promise<number> {
  const outlinesDir = join(contentDir, 'outlines');
  const briefsDir = join(contentDir, 'briefs');
  const lessonsDir = join(contentDir, 'lessons');
  const outlineFiles = (await readdir(outlinesDir)).filter((name) => name.endsWith('.json'));

  const rows = new Map<string, LessonRow>();
  const contexts = new Map<string, lessons.OutlineContext>();
  const fileOfId = new Map<string, string>();

  for (const fileName of outlineFiles) {
    const result = LessonOutlineFileSchema.safeParse(
      await readJson(join(outlinesDir, fileName), fileName),
    );
    if (!result.success) {
      throw new Error(`Invalid outline file ${fileName}: ${result.error.message}`);
    }

    const file = result.data;
    file.entries.forEach((entry, index) => {
      const previousFile = fileOfId.get(entry.id);
      if (previousFile !== undefined) {
        throw new Error(`Duplicate lesson id "${entry.id}" in ${previousFile} and ${fileName}`);
      }
      fileOfId.set(entry.id, fileName);
      contexts.set(entry.id, { entry, lang: file.lang, level: file.level });

      rows.set(entry.id, {
        id: entry.id,
        lang: file.lang,
        level: file.level,
        position: index + 1,
        kind: entry.kind,
        topic: entry.topic ?? null,
        theme: entry.theme ?? null,
        title: entry.workingTitle,
        summary: entry.intent,
        brief: {},
        content: null,
        ready: false,
      });
    });
  }

  // Every lesson file belongs to an outline entry, and a content file to a brief.
  const briefIds = await jsonIds(briefsDir);
  const contentIds = new Set(await jsonIds(lessonsDir));
  const strays = [
    ...briefIds.filter((id) => !rows.has(id)).map((id) => `briefs/${id}.json`),
    ...[...contentIds].filter((id) => !rows.has(id)).map((id) => `lessons/${id}.json`),
    ...[...contentIds]
      .filter((id) => rows.has(id) && !briefIds.includes(id))
      .map((id) => `lessons/${id}.json (it has no brief)`),
  ];
  if (strays.length > 0) {
    throw new Error(`Lesson files that no outline entry plans: ${strays.join(', ')}`);
  }

  for (const id of briefIds) {
    const brief = await readJson(join(briefsDir, `${id}.json`), `briefs/${id}.json`);
    const content = contentIds.has(id)
      ? await readJson(join(lessonsDir, `${id}.json`), `lessons/${id}.json`)
      : undefined;
    const result = lessons.validateLesson(brief, content, contexts.get(id)!);
    if (!result.ok) {
      const issues = result.issues.map(({ path, message }) => `  ${path}: ${message}`);
      throw new Error(`Invalid lesson ${id}:\n${issues.join('\n')}`);
    }
    Object.assign(rows.get(id)!, {
      title: result.title,
      summary: result.summary,
      brief: result.brief,
      content: result.content,
      ready: true,
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
    writes.map(({ content, ...fields }) => {
      const row = { ...fields, content: content ?? Prisma.DbNull };
      return prisma.lesson.upsert({ where: { id: row.id }, create: row, update: row });
    }),
  );
  return writes.length;
}

/** Null when the demo learners should be seeded, else why not. */
export function demoSkipReason(env: NodeJS.ProcessEnv): string | null {
  // An allowlist: the public server seeds with only DATABASE_URL, NODE_ENV unset.
  if (env.NODE_ENV !== 'development') {
    return `NODE_ENV is ${env.NODE_ENV ?? 'unset'}, not development`;
  }
  // Every .env has the key (make env-file adds it empty), so empty means skip.
  if ((env.DEMO_PASSWORD ?? '').trim() === '') {
    return 'DEMO_PASSWORD is empty';
  }
  return null;
}

/** The demo learners' password, checked with the signup rules. Never prints it. */
export function demoPassword(env: NodeJS.ProcessEnv): string {
  const password = env.DEMO_PASSWORD ?? '';
  const result = PasswordSchema.safeParse(password);
  if (!result.success) {
    const codes = result.error.issues.map((issue) => issue.message).join(', ');
    throw new Error(`DEMO_PASSWORD fails the signup rules: ${codes}`);
  }
  return password;
}

// Runs only when this file is the entry point, so a test importing
// seedQuestionBank does not seed the real database.
if (require.main === module) {
  // Before anything is written: a bad password fails the seed at once.
  const skip = demoSkipReason(process.env);
  const password = skip === null ? demoPassword(process.env) : null;

  // PrismaService, not a bare PrismaClient: the demo learners build the api
  // services on it, outside Nest. Its constructor checks DATABASE_URL, and
  // without Nest nothing calls onModuleInit: Prisma connects on the first query.
  const prisma = new PrismaService();

  seedQuestionBank(findContentDir('items'), prisma)
    .then((count) => console.log(`seeded ${count} questions from ${findContentDir('items')}`))
    .then(() => seedLessons(dirname(findContentDir('outlines')), prisma))
    .then((count) =>
      console.log(`seeded ${count} lessons from ${dirname(findContentDir('outlines'))}`),
    )
    .then(async () => {
      if (password === null) {
        console.log(`demo learners skipped: ${skip}`);
        return;
      }
      // Loaded here only, so the public server never even reads the demo code.
      const { seedDemo } = await import('../src/demo/demo');
      await seedDemo(prisma, { runNow: new Date(), password });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
