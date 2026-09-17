import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ItemFileSchema } from '@ft/shared';

// Same guard as PrismaService: left undefined, node-postgres falls back to its
// own PG* defaults and fails with a misleading localhost connection error.
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is unset: the seed script cannot run. See .env.example.');
  }
  return url;
}

function findItemsDir(): string {
  const candidateFromRoot = resolve(process.cwd(), 'content/items');
  if (existsSync(candidateFromRoot)) {
    return candidateFromRoot;
  }

  const candidateFromApi = resolve(process.cwd(), '../../content/items');
  if (existsSync(candidateFromApi)) {
    return candidateFromApi;
  }

  throw new Error('Impossible to find directory content/items');
}

export async function seedQuestionBank(dir: string, prisma: PrismaClient) {
  const allEntries = await readdir(dir);
  const jsonFiles = allEntries.filter((name) => name.endsWith('.json'));

  const operations = [];

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
}

// Only runs the seed when this file is executed directly (`db:seed`), not when
// a test imports seedQuestionBank against its own fixtures and Prisma client.
if (require.main === module) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  seedQuestionBank(findItemsDir(), prisma)
    .then(() => console.log('done'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
