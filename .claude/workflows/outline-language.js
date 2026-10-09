export const meta = {
  name: 'outline-language',
  description: 'Write and review the six lesson outlines of one course language, one phase per run',
  whenToUse:
    'Run from the outline-language skill, one phase at a time: research, plan, assemble, review, focus.',
  phases: [
    { title: 'Research' },
    { title: 'Plan' },
    { title: 'Check' },
    { title: 'Assemble' },
    { title: 'Review' },
    { title: 'Verify and apply' },
    { title: 'Cross-level' },
    { title: 'Scan' },
    { title: 'Narrow' },
  ],
};

// args: { lang, phase, workdir, standard, conventions, sources? } (see .claude/skills/outline-language/SKILL.md)
const PHASES = ['research', 'plan', 'assemble', 'review', 'focus'];
if (!args || !args.lang || !args.workdir || !PHASES.includes(args.phase)) {
  throw new Error(`args needs lang, workdir and phase (one of ${PHASES.join(', ')})`);
}
const { lang, workdir: W } = args;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const file = (level) => `/workspace/content/outlines/${lang}-${level.toLowerCase()}.json`;
const CHECK = `pnpm --filter @ft/api outlines:check ${lang}`;

const BASE = `
Course language: ${lang}. Standard: ${args.standard || 'ask the user'}. Repo: /workspace.
Rules: docs/LESSONS.md, sections 1, 2, 4, 5, 9 and 10 (if it is not on the branch yet: git show origin/docs/76-lesson-docs:docs/LESSONS.md). The lesson counts per level and per kind are KIND_COUNTS[${lang}] and LESSONS_PER_LEVEL in packages/shared/src/schemas/lesson.ts; they are exact. Finished, reviewed outlines to learn the shape and quality from: content/outlines/en-*.json and de-*.json (all six levels) and fr-a1.json. The skill .claude/skills/outline-language/SKILL.md lists the rules the earlier reviews kept catching.
Entry: {"id","kind","topic" (grammar only) or "theme" (other kinds),"workingTitle","intent"}, keys in that order. Topics and themes: TOPICS in packages/shared/src/schemas/item.ts and THEMES in lesson.ts.
- id: "${lang}-" plus English words, lowercase and single hyphens, no digits, no level, at most 64 characters, unique across the language's six files and specific (${lang}-present-perfect-for-and-since, not ${lang}-present-perfect-two). Reading ids start ${lang}-reading-. British spelling in ids. Keep any ids the language's issue uses in its examples.
- workingTitle: at most 80 characters, in the course language, unique across the six files after foldText. Conventions per kind: ${args.conventions || 'as in the existing outlines'}.
- intent: one line, at most 200 characters, in the course language, what the learner can do after the lesson with concrete target language inline (after a colon or in brackets, no quotation marks). Vocabulary: about how many words and 5 to 8 examples, with their article in a language with grammatical gender. Never mention the level.
- Style: no em or en dashes, no quotation marks of any kind (French may keep « »), no double spaces, no outer spaces.
- One focus per lesson, ten minutes: about 3 grammar statements or 12 to 15 new words. Each lesson builds on the ones before it and on the levels below; nothing in an intent may use a word or structure taught later, except fixed phrases in function lessons. No two entries teach the same thing across all levels and kinds: a spiral point returns with a named slice. Grammar owns structures, vocabulary owns word sets, collocations, word formation, idioms and register, functions own communicative tasks, reading owns understanding a kind of text.
- Copyright (LESSONS.md section 10): never copy wording, examples or word lists from a source.${args.sources ? `\nSources the user named: ${args.sources}` : ''}`;

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string' },
          id: { type: 'string' },
          problem: { type: 'string' },
          fix: {
            type: 'string',
            description:
              'concrete change: new text, new position (after which id), or replacement entry',
          },
          severity: { type: 'string', enum: ['must', 'should'] },
        },
        required: ['id', 'problem', 'fix'],
      },
    },
  },
  required: ['findings'],
};

if (args.phase === 'research') {
  const R = `${W}/research`;
  const common = `${BASE}
Research only: write your notes to the file named below (create ${R} and ${R}/raw for downloads), then return a 10-line summary of what it holds and which parts were fetched and which are your own knowledge. Record point names and level placements as facts; never paste descriptor wording, example sentences or word lists. Use WebSearch and WebFetch (load them with ToolSearch if deferred), curl and a PDF-to-text fallback.`;
  const tasks = [
    [
      'grammar-a1-b1',
      "Grammar A1 to B1: the official level inventories and exam specifications for this language (the national institute's exams, reference level descriptions, integration or university entry curricula). Per level, each point with its first productive level, what later levels add, and the nearest topic; end with candidate lists sized exactly to the grammar counts of A1, A2 and B1.",
    ],
    [
      'grammar-b2-c2',
      'Grammar B2 to C2: exam specifications, advanced coursebooks and university entrance tests (inventories above B1 are rare: say where you found yours). Per level, each point with what it adds to an earlier slice and its topic; end with candidate lists sized exactly to the grammar counts of B2, C1 and C2.',
    ],
    [
      'vocabulary',
      'Vocabulary A1 to C2: official word lists and their topic groups, words per level, the lexical areas beyond topics at B2 to C2 (word formation, collocations, idioms, register), a ladder for each theme from A1 to C2, then named sets sized exactly to the vocabulary counts of each level, none repeated across levels, plus reserves.',
    ],
    [
      'reading-functions',
      'Reading and functions A1 to C2: the text types the exams read at each level, the communicative functions of the reference descriptions and of the CEFR Companion Volume, progression chains so a text type or function returns with a new slice; candidates for more than the reading and functions counts of each level, each with a theme.',
    ],
    [
      'sequence',
      "Teaching order: the public tables of contents of this language's main coursebooks and free courses, level by level. The usual order of grammar points and topics inside each level, which points books split into several lessons, and what makes the first 42 A1 lessons coherent for a complete beginner.",
    ],
  ];
  phase('Research');
  return await parallel(
    tasks.map(
      ([key, what]) =>
        () =>
          agent(`${common}\nYour file: ${R}/${key}.md\n${what}`, {
            label: `research:${key}`,
            phase: 'Research',
          }).then((summary) => ({ key, summary })),
    ),
  );
}

if (args.phase === 'plan') {
  const P = `${W}/plan`;
  const rules = `${BASE}
Research notes for this language: ${W}/research/*.md (grammar-a1-b1, grammar-b2-c2, vocabulary, reading-functions, sequence).
Write your part as a JSON object keyed by level ({"A1":[...],...}) with exactly the counts of your kind and levels, pretty-printed, to the file named below; write long files in chunks and make sure the result parses. Do not write under /workspace. List entries of each level in teaching order. Return counts, main choices and doubts.`;
  const parts = [
    [
      'grammar-a1-b1',
      'GRAMMAR for A1, A2, B1. Another planner writes B2 to C2 grammar in parallel: read research/grammar-b2-c2.md so the halves meet without gaps or repeats.',
    ],
    [
      'grammar-b2-c2',
      'GRAMMAR for B2, C1, C2. Another planner writes A1 to B1 in parallel: read research/grammar-a1-b1.md so you never repeat a B1 slice.',
    ],
    ['functions', 'FUNCTIONS for all six levels.'],
    ['reading-a1-b2', 'READING for A1, A2, B1, B2. Another planner writes C1 and C2 in parallel.'],
    [
      'reading-c1-c2',
      'READING for C1 and C2. Another planner writes A1 to B2 in parallel: do not repeat a text type with the same task. Each reading says what the learner does with the text, not only its topic.',
    ],
    ['vocabulary-a1-a2', 'VOCABULARY for A1 and A2.'],
    ['vocabulary-b1', 'VOCABULARY for B1.'],
    ['vocabulary-b2', 'VOCABULARY for B2.'],
    ['vocabulary-c1', 'VOCABULARY for C1.'],
    ['vocabulary-c2', 'VOCABULARY for C2. Avoid words that date fast or are politically charged.'],
  ];
  phase('Plan');
  const planned = await parallel(
    parts.map(
      ([key, what]) =>
        () =>
          agent(
            `${rules}\nYour part: ${what} Other planners write the other vocabulary levels in parallel from the same notes: take only your levels' sets.\nYour file: ${P}/${key}.json`,
            { label: `plan:${key}`, phase: 'Plan' },
          ).then((summary) => ({ key, summary })),
    ),
  );
  phase('Check');
  const check = await agent(
    `${rules}
You are the plan checker. Ten planners wrote ${P}/*.json in parallel; their summaries: ${JSON.stringify(planned.filter(Boolean))}
1. Run node /workspace/.claude/skills/outline-language/merge-plan.mjs ${W} ${lang} and then, from /workspace, ${CHECK} --dir ${P}/merged. Fix every problem in the part files (never in merged/) until it prints ok.
2. Read the whole plan and hunt, with helper scripts for suspicious pairs, for: entries teaching the same thing (within and across levels and kinds, above all at the seams between planners), level misfits, gaps against the research notes, lessons too big for ten minutes, wrong or unnatural language, missing articles.
3. Fix in the part files with exact counts kept, rerun the check, and write ${P}/CHECK.md with every change and what you left as is. Return a summary.`,
    { label: 'check:plan', phase: 'Check' },
  );
  return { planned: planned.filter(Boolean), check };
}

if (args.phase === 'assemble') {
  phase('Assemble');
  return await parallel(
    LEVELS.map(
      (level) => () =>
        agent(
          `${BASE}
You assemble ${level}. The checked plan is ${W}/plan/merged/${lang}-${level.toLowerCase()}.json, grouped by kind; the other levels are next to it; read ${W}/plan/CHECK.md and ${W}/research/sequence.md.
1. ORDER all entries into the course a learner follows: each lesson after what it needs, functions and readings after their grammar and vocabulary, readings closing a topic, spiral slices in order, kinds interleaved in short clusters (no three grammar lessons in a row, no two readings in a row, functions spread out).${level === 'A1' ? ' The first 42 lessons must make sense on their own for a complete beginner.' : ''}
2. POLISH every title and intent as a native-speaker teacher would, within the rules. Keep ids, kinds, topics and themes unless plainly wrong; a replaced entry keeps its kind.
3. WRITE ${file(level)} as {"lang":"${lang}","level":"${level}","entries":[...]} with a node script (JSON.stringify(data, null, 2) + "\\n") from a copy of the plan, touching no other file under /workspace.
4. CHECK from /workspace until clean: ${CHECK} --level ${level}, and npx prettier --check on your file.
Return the cluster structure, every rewrite with its reason, and doubts.`,
          { label: `assemble:${level}`, phase: 'Assemble' },
        ).then((summary) => ({ level, summary })),
    ),
  );
}

if (args.phase === 'review') {
  const lenses = [
    [
      'curriculum',
      'a CEFR curriculum designer for this language: level fit against the research notes, ten-minute scope, order (nothing used before it is taught, spiral slices in order, clusters), overlap within the level and with the levels next to it, and gaps with the weakest entry of the same kind that could give up its slot',
    ],
    [
      'language',
      'a native speaker and experienced materials editor: correctness of every title, intent and quoted example (grammar, gender, spelling, the chosen standard), naturalness and clarity, word lists that match their set, articles in vocabulary intents, consistency, content that dates fast or is inappropriate',
    ],
  ];
  phase('Review');
  const perLevel = await pipeline(
    LEVELS,
    (level) =>
      parallel(
        lenses.map(
          ([key, who]) =>
            () =>
              agent(
                `${BASE}\nYou are ${who}. Review ${file(level)} entry by entry (research notes in ${W}/research/, plan notes in ${W}/plan/CHECK.md). Do not edit files. Report only real problems with concrete fixes (exact replacement text within the limits).`,
                { label: `review:${level}:${key}`, phase: 'Review', schema: FINDINGS },
              ).then((r) => ({ lens: key, findings: r ? r.findings : [] })),
        ),
      ),
    (reviews, level) =>
      agent(
        `${BASE}
You are the skeptical verifier and editor for ${level}. For each finding below, read the entry, its neighbours and the notes, and decide if it is real; default to not real for taste or a fix that makes things worse. Apply the real ones to ${file(level)} with a node script by id, counts per kind exact, ids unchanged unless wrong. Edit no other level (list cross-level changes instead). Check from /workspace until clean: ${CHECK} --level ${level} and prettier. Write ${W}/review/${level}.md with every verdict. Return applied, rejected and cross-level changes needed.
Findings: ${JSON.stringify(reviews.filter(Boolean))}`,
        { label: `apply:${level}`, phase: 'Verify and apply' },
      ).then((summary) => ({ level, summary })),
  );
  phase('Cross-level');
  const cross = await agent(
    `${BASE}
You are the final cross-level editor. The level editors' summaries: ${JSON.stringify(perLevel.filter(Boolean))}
Make the cross-level changes they listed if right; with helper scripts, hunt pairs across levels that teach the same thing; check that every spiral grammar point and every vocabulary theme moves forward level by level with nothing missing. Fix by id, counts exact, ids and titles unique. Check until clean from /workspace: ${CHECK}, npx prettier --check content/outlines/, pnpm --filter @ft/api test src/lessons/. Write ${W}/review/CROSS.md and return a summary.`,
    { label: 'cross-level', phase: 'Cross-level' },
  );
  return { perLevel: perLevel.filter(Boolean), cross };
}

// focus
const groups = [
  ['A1', 'A2'],
  ['B1', 'B2'],
  ['C1', 'C2'],
];
return await pipeline(
  groups,
  (levels) =>
    agent(
      `${BASE}
Scan every entry of ${levels.map(file).join(' and ')} for lessons that combine two or more focuses that do not belong in one ten-minute lesson: two unrelated uses of one form (the English review missed "Could: past ability and polite requests"), two grammar points with no shared rule, a function doing two separate tasks, a reading with two unrelated texts, a word set mixing two themes. A contrast that is the point of the lesson is one focus. For each, find in all six files where the dropped part is already taught, and propose the narrowed title and intent. Do not edit files.`,
      { label: `scan:${levels.join('-')}`, phase: 'Scan', schema: FINDINGS },
    ),
  (scan, levels) => {
    const findings = scan ? scan.findings : [];
    log(`${levels.join('-')}: ${findings.length} candidates`);
    if (!findings.length) return { levels, summary: 'no candidates' };
    return agent(
      `${BASE}
You are the skeptical verifier for ${levels.join(' and ')}. For each candidate, decide if it really is two focuses and whether narrowing loses coverage (if the dropped part is taught nowhere else, move it into a fitting entry or keep it). Default to not real for a pair coursebooks teach together. Apply the real ones to ${levels.map(file).join(' and ')} only, by id, counts exact; rename an id that names a dropped part to an unused one. Check from /workspace: ${CHECK} --level ${levels[0]}, the same for ${levels[1]}, and prettier. Append verdicts to ${W}/review/ONE-FOCUS.md. Return applied and rejected.
Candidates: ${JSON.stringify(findings)}`,
      { label: `narrow:${levels.join('-')}`, phase: 'Narrow' },
    ).then((summary) => ({ levels, summary }));
  },
);
