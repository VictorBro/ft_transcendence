/**
 * Manual check of real LLM output: one live call, validated, printed. Writes nothing to the database.
 * Spends tokens: needs LLM_API_KEY in the root .env.
 *
 *   pnpm --filter @ft/api exec tsx --env-file=../../.env scripts/try-generation.ts fr B1 grammar
 */
import { ConfigService } from '@nestjs/config';
import {
  generatedBatchSchema,
  LanguageSchema,
  LevelSchema,
  QuestionCategorySchema,
} from '@ft/shared';
import { GeminiProvider } from '../src/llm/gemini.provider';
import { buildGenerateQuestionsPrompt } from '../src/questions-generation/prompts/generate-questions.prompt';

async function main() {
  const lang = LanguageSchema.parse(process.argv[2] ?? 'fr');
  const level = LevelSchema.parse(process.argv[3] ?? 'B1');
  const category = QuestionCategorySchema.parse(process.argv[4] ?? 'grammar');

  // Without a module, ConfigService reads straight from process.env.
  const provider = new GeminiProvider(new ConfigService());
  const prompt = buildGenerateQuestionsPrompt({ lang, level, category });

  const started = Date.now();
  const raw = await provider.generateStructured<unknown>(prompt);
  console.log(`\n${lang}-${level}-${category}: answered in ${Date.now() - started} ms\n`);

  const result = generatedBatchSchema(category).safeParse(raw);
  if (!result.success) {
    console.log('REJECTED by generatedBatchSchema, the service would retry then fall back:');
    console.log(JSON.stringify(result.error.issues, null, 2));
    console.log('\nRaw response:');
    console.log(JSON.stringify(raw, null, 2));
    process.exitCode = 1;
    return;
  }

  result.data.items.forEach((item, i) => {
    console.log(`#${i + 1} [${item.topic}] level=${item.level} time=${item.timeLimitS}s`);
    if (item.readText) console.log(`   Text: ${item.readText}`);
    console.log(`   Q: ${item.question}`);
    for (const option of item.options) {
      console.log(`   ${option === item.answer ? '✓' : ' '} ${option}`);
    }
    console.log();
  });

  console.log(`VALID: ${result.data.items.length} questions`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
