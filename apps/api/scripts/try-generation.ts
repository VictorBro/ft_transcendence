/**
 * Full-path check: prompt -> provider -> validation -> retry -> createMany, for every
 * lang x level x category cell, then prints the rows each cell inserted.
 * WRITES to the database (sourceId = null) and, with Gemini, spends tokens: 54 LLM calls.
 *
 *   LLM_PROVIDER=gemini pnpm --filter @ft/api exec tsx --env-file=../../.env scripts/try-generation.ts
 */
import { ConfigService } from '@nestjs/config';
import { LEARNABLE_LANGUAGES, LEVELS, QUESTION_CATEGORIES } from '@ft/shared';
import { FixtureProvider } from '../src/llm/fixture.provider';
import { GeminiProvider } from '../src/llm/gemini.provider';
import { selectLlmProvider } from '../src/llm/llm.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { QuestionGenerationService } from '../src/questions-generation/questions-generation.service';

async function main() {
  // Without a module, ConfigService reads straight from process.env.
  const config = new ConfigService();
  const provider = selectLlmProvider(
    config.get<string>('LLM_PROVIDER', 'fixture'),
    new FixtureProvider(),
    new GeminiProvider(config),
  );
  const prisma = new PrismaService();
  const service = new QuestionGenerationService(prisma, provider);

  try {
    for (const lang of LEARNABLE_LANGUAGES) {
      for (const level of LEVELS) {
        for (const category of QUESTION_CATEGORIES) {
          const started = new Date();
          // Bracket access skips `private`: same method the API runs in the background, awaited here.
          await service['replenishQuestions'](lang, level, category);

          const rows = await prisma.questionBank.findMany({
            where: { lang, level, category, sourceId: null, createdAt: { gte: started } },
            orderBy: { createdAt: 'asc' },
          });
          console.log(`\n=== ${lang}-${level}-${category}: ${rows.length} rows inserted ===`);
          console.log(JSON.stringify(rows, null, 2));
        }
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
