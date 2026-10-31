/**
 * What the model reads to write a lesson (#83): lessons:author sends it,
 * and `lessons:check <id> --rules` prints it for the /author-lessons skill.
 *
 * The system prompt is the same for every lesson of a kind, so both
 * providers cache it from the second lesson on. It holds the ground truth,
 * not a summary of it: the kind's schema and validator sources as they
 * are in @ft/shared, and one complete lesson that passes them. A change
 * to a rule reaches the next run with nothing to update here.
 *
 * The user message holds what changes per lesson: the outline entry, its
 * neighbours and the titles already taken.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  Language,
  Level,
  LessonKind,
  LessonOutlineEntry,
  LessonOutlineFile,
} from '@ft/shared';

/** Raise it when the prompt changes: every file records the version it was written with. */
export const PROMPT_VERSION = 'author-2';

const SHARED = join(__dirname, '../../../../packages/shared');
const LESSONS = join(SHARED, 'src/lessons');
const FIXTURES = join(SHARED, 'test/fixtures');

/** Sources every kind needs: the envelope and its building blocks, the shared checks, the Markdown. */
const COMMON = [
  'schemas/artifactCommon.ts',
  'validation/common.ts',
  'domain/richText.ts',
  'domain/lessonCopy.ts',
];

const BY_KIND: Record<
  LessonKind,
  { sources: string[]; sample: { brief: string; content?: string } }
> = {
  vocabulary: {
    sources: [
      'schemas/vocabulary.ts',
      'validation/vocabulary.ts',
      'domain/vocabularyLesson.ts',
      'domain/vocabularyAnswers.ts',
    ],
    sample: { brief: 'content/briefs/fr-classroom-objects.json' },
  },
  grammar: {
    sources: ['schemas/grammar.ts', 'validation/grammar.ts', 'validation/grammarLength.ts'],
    sample: {
      brief: 'samples/briefs/fr-verb-etre-present.json',
      content: 'samples/lessons/fr-verb-etre-present.json',
    },
  },
  functions: {
    sources: ['schemas/functions.ts', 'validation/functions.ts', 'domain/functionsLesson.ts'],
    sample: {
      brief: 'samples/briefs/fr-ordering-at-a-cafe.json',
      content: 'samples/lessons/fr-ordering-at-a-cafe.json',
    },
  },
  reading: {
    sources: ['schemas/reading.ts', 'validation/reading.ts', 'domain/readingLesson.ts'],
    sample: {
      brief: 'samples/briefs/fr-reading-a-text-message.json',
      content: 'samples/lessons/fr-reading-a-text-message.json',
    },
  },
};

/** What the complete step writes: the model may leave these out, they are overwritten anyway. */
const COMPUTED: Record<LessonKind, string> = {
  vocabulary: 'targetCount, estimatedMinutes',
  grammar:
    'estimatedMinutes (both files) and the timeLimitS of every content page (copied from the brief exam plan, null elsewhere). You DO choose every estimatedDurationS, explanationDurationS and the brief exam timeLimitS, within GRAMMAR_LENGTH',
  functions:
    'estimatedMinutes (both files), and every estimatedDurationS and timeLimitS of the content',
  reading:
    'estimatedMinutes (both files), every estimatedDurationS and timeLimitS of the content, and every skimSeconds',
};

/** A fixture on one line: fewer tokens, read the same. */
const minified = (path: string) => JSON.stringify(JSON.parse(readFileSync(path, 'utf8')));

/** The rules of one kind: its sources, one lesson that passes them, and the reply format. */
export function systemPrompt(kind: LessonKind): string {
  const { sources, sample } = BY_KIND[kind];
  const files = [...COMMON, ...sources]
    .map(
      (f) =>
        `<source path="packages/shared/src/lessons/${f}">\n${readFileSync(join(LESSONS, f), 'utf8')}\n</source>`,
    )
    .join('\n\n');
  const example = sample.content
    ? `{"brief":${minified(join(FIXTURES, sample.brief))},"content":${minified(join(FIXTURES, sample.content))}}`
    : `{"brief":${minified(join(FIXTURES, sample.brief))}}`;

  return `You write ${kind} lessons for a language learning app. A lesson is ${
    sample.content
      ? 'two JSON files, a brief (the plan) and a content file (the playable lesson)'
      : 'one JSON file, its brief: the app builds the playable lesson from it'
  }. A program checks every lesson with the zod schemas and validators below and sends you back every issue until the lesson passes.

# The rules: the source code that checks your lesson

${files}

# A complete lesson that passes every check

${example}

# How to answer

- Answer with ONE JSON object and nothing else: no prose, no Markdown, no code fence. Minified, on one line.
- The first time: ${sample.content ? '{"brief":{…},"content":{…}}' : '{"brief":{…}}'}.
- The program writes these fields itself, so you may leave them out: schemaVersion, id, lang, level, locales, kind, topic, theme, scoring, provenance, ${COMPUTED[kind]}.${
    sample.content ? ' The content file copies its title and objective from the brief.' : ''
  }
- When the program sends you issues, answer either the whole lesson again in the same shape, or only edits:
  {"edits":[{"file":"brief","path":"targets.3.examForms","value":["un livre"]},{"file":"content","path":"steps.2.pages.0.items.1","delete":true}]}
  A path is the one of the issue: dot-separated, numbers are array indices, the "brief." or "content." prefix may stay. Every path refers to the lesson as the issues describe it, even after a delete in the same reply. "value" replaces what is at the path; "delete" removes it. Prefer edits when few things are wrong; resend the whole lesson when the structure is wrong.
- The example above is a model of the format and the quality expected, not content to copy: write a new lesson for the outline entry you are given, in its course language and level.
- Title: at most 80 characters, one line, in the course language. objective[course language]: at most 200 characters, one line.
- Write natural, correct language. Teach exactly what the outline entry's intent says, at its CEFR level.`;
}

interface LessonRequest {
  entry: LessonOutlineEntry;
  lang: Language;
  level: Level;
  /** The entry's outline: the five entries on each side go in the prompt. */
  outline: LessonOutlineFile;
  /** Every title already written in this course language. */
  usedTitles: string[];
}

/** The first prompt of a lesson: its outline entry, the lessons around it, the titles taken. */
export function lessonPrompt(r: LessonRequest): string {
  const at = r.outline.entries.findIndex((e) => e.id === r.entry.id);
  const neighbours = [
    ...r.outline.entries.slice(Math.max(0, at - 5), at),
    ...r.outline.entries.slice(at + 1, at + 6),
  ];
  const near = neighbours.map((e) => `- ${e.id} (${e.kind}): ${e.workingTitle}. ${e.intent}`);
  return `Write the lesson for this outline entry. Course language: ${r.lang}. Level: ${r.level}.

${JSON.stringify(r.entry, null, 2)}

The lessons around it in the course, so you neither repeat them nor teach what comes later:
${near.join('\n') || '(none)'}

Titles already taken in this course, not to reuse: ${r.usedTitles.length ? r.usedTitles.join(' | ') : '(none)'}`;
}

/** Every later prompt: what is still wrong, and the edits that could not apply. */
export function issuesPrompt(
  issues: { path: string; message: string }[],
  editProblems: string[],
): string {
  const lines = issues.map((i) => `- ${i.path || '(file)'}: ${i.message}`);
  const problems = editProblems.length
    ? `\n\nSome of your edits could not apply:\n${editProblems.map((p) => `- ${p}`).join('\n')}`
    : '';
  return `The lesson does not pass yet. ${issues.length} issue${issues.length === 1 ? '' : 's'}:
${lines.join('\n')}${problems}

Fix every issue. Prefer answering with {"edits":[{"file":"brief"|"content","path":"...","value":...}]} so you only send the changed fields instead of rewriting the whole lesson. If you rewrite, include both "brief" and "content" (when applicable), as one minified JSON object.`;
}
