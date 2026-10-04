/**
 * Restocks one level of the bank for real (prompt, provider, validation, dedup,
 * insert) in every learnable language, for the given categories or all three,
 * and prints what each cell gained. WRITES to DATABASE_URL and, with Gemini,
 * spends tokens: one call per cell, two when it retries.
 *
 *   LLM_PROVIDER=gemini pnpm --filter @ft/api generation:try b1 vocabulary grammar
 */
import {
  LEARNABLE_LANGUAGES,
  LEVELS,
  LevelSchema,
  QUESTION_CATEGORIES,
  QuestionCategorySchema,
} from '@ft/shared';
import { z } from 'zod';

import { createLlmProvider } from '../src/llm/llm.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { QuestionStockService } from '../src/question-generation/question-stock.service';

async function main() {
  const level = LevelSchema.safeParse(process.argv[2]?.toUpperCase());
  const picked = z.array(QuestionCategorySchema).safeParse(process.argv.slice(3));
  if (!level.success || !picked.success) {
    console.error(
      `Usage: generation:try <${LEVELS.join('|')}> [${QUESTION_CATEGORIES.join('|')} ...]`,
    );
    process.exitCode = 1;
    return;
  }
  const categories = picked.data.length > 0 ? picked.data : QUESTION_CATEGORIES;
  const prisma = new PrismaService();
  const stock = new QuestionStockService(prisma, createLlmProvider(process.env));

  try {
    for (const lang of LEARNABLE_LANGUAGES) {
      for (const category of categories) {
        const cell = { lang, level: level.data, category };
        const started = new Date();
        const { status } = await stock.restock(cell, 0);
        const ms = Date.now() - started.getTime();
        if (status !== 'filled') process.exitCode = 1;

        const rows = await prisma.questionBank.findMany({
          where: { ...cell, sourceId: null, createdAt: { gte: started } },
          select: { topic: true, readText: true, question: true, options: true, answer: true },
          orderBy: { createdAt: 'asc' },
        });
        console.log(
          `\n=== ${lang} ${level.data} ${category}: ${status}, ${rows.length} new, ${ms} ms`,
        );
        console.log(JSON.stringify(rows, null, 2));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
