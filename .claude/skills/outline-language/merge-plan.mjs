// Merges the planners' part files (<workdir>/plan/*.json, each { "A1": [entries], ... })
// into <workdir>/plan/merged/<lang>-<level>.json, so outlines:check can run on the plan:
//
//   node .claude/skills/outline-language/merge-plan.mjs <workdir> <lang>
//   pnpm --filter @ft/api outlines:check <lang> --dir <workdir>/plan/merged
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [workdir, lang] = process.argv.slice(2);
if (!workdir || !lang) {
  console.error('Usage: merge-plan.mjs <workdir> <lang>');
  process.exit(1);
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const plan = join(workdir, 'plan');
const merged = join(plan, 'merged');
mkdirSync(merged, { recursive: true });

const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
for (const name of readdirSync(plan)
  .filter((n) => n.endsWith('.json'))
  .sort()) {
  const part = JSON.parse(readFileSync(join(plan, name), 'utf8'));
  for (const [level, entries] of Object.entries(part)) {
    if (!byLevel[level]) throw new Error(`${name}: unknown level ${level}`);
    byLevel[level].push(...entries);
  }
}
for (const level of LEVELS) {
  const file = { lang, level, entries: byLevel[level] };
  writeFileSync(
    join(merged, `${lang}-${level.toLowerCase()}.json`),
    JSON.stringify(file, null, 2) + '\n',
  );
}
console.log(LEVELS.map((level) => `${level} ${byLevel[level].length}`).join(', '));
