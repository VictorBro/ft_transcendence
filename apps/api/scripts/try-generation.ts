/**
 * Full-path check: prompt -> provider -> validation -> retry -> createMany, for the
 * vocabulary category of one level in every learnable language, then prints the rows
 * each cell inserted.
 * WRITES to the database (sourceId = null) and, with Gemini, spends tokens: 3 LLM calls.
 *
 *   LLM_PROVIDER=gemini pnpm --filter @ft/api exec tsx --env-file=../../.env scripts/try-generation.ts b1
 */
import { ConfigService } from '@nestjs/config';
import { LEARNABLE_LANGUAGES, LEVELS, LevelSchema, QuestionCategory } from '@ft/shared';
import { FixtureProvider } from '../src/llm/fixture.provider';
import { GeminiProvider } from '../src/llm/gemini.provider';
import { selectLlmProvider } from '../src/llm/llm.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { QuestionGenerationService } from '../src/questions-generation/questions-generation.service';

const CATEGORY: QuestionCategory = 'vocabulary';

async function main() {
  // Accepts "b1" as well as "B1".
  const parsedLevel = LevelSchema.safeParse(process.argv[2]?.toUpperCase());
  if (!parsedLevel.success) {
    console.error(`Usage: try-generation.ts <level>, level one of ${LEVELS.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const level = parsedLevel.data;

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
    // One call per language, one after the other.
    for (const lang of LEARNABLE_LANGUAGES) {
      const started = new Date();
      // Bracket access skips `private`: same method the API runs in the background, awaited here.
      await service['replenishQuestions'](lang, level, CATEGORY);

      const rows = await prisma.questionBank.findMany({
        where: { lang, level, category: CATEGORY, sourceId: null, createdAt: { gte: started } },
        orderBy: { createdAt: 'asc' },
      });
      console.log(`\n=== ${lang}-${level}-${CATEGORY}: ${rows.length} rows inserted ===`);
      console.log(JSON.stringify(rows, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
