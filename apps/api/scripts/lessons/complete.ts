/**
 * The complete step (#83): everything in a lesson file that the model is
 * not asked to write, because the code knows it or computes it exactly.
 *
 *   the model's draft ─→ complete() ─→ validateLesson
 *                        envelope, provenance, scoring,
 *                        every duration (times.ts)
 *
 * It runs on the raw draft, before any schema: a field the draft left out
 * is added, a wrong one is overwritten, the rest is kept as written.
 */
import { lessons, type Language, type Level, type LessonOutlineEntry } from '@ft/shared';

import { isObject, sha256, type Json } from './json';
import { computeTimes } from './times';

/** A lesson being written: its brief and, for every kind but vocabulary, its content file. */
export interface Draft {
  brief: Json;
  content?: Json;
}

/** Where the lesson belongs and who wrote it, for the envelope and the provenance. */
export interface CompleteContext {
  entry: LessonOutlineEntry;
  lang: Language;
  level: Level;
  /** The model that wrote the draft: sonnet, deepseek-chat, claude-code (the skill)… */
  model: string;
  /** PROMPT_VERSION for lessons:author, the skill's version for lessons:check. */
  promptVersion: string;
}

export const GENERATOR = 'ft lessons:author';
const SCORING = { practiceWeight: 35, examWeight: 65, orthographyCredit: 0.5 };

/**
 * Puts the envelope first, in the schema's order, then the rest of the
 * file: the files read the same whatever order the model used. The head is
 * spread twice so that its values win over the draft's while keeping its order.
 */
function withEnvelope(file: Json, ctx: CompleteContext, provenance: Json): Json {
  const { entry } = ctx;
  const head = {
    schemaVersion: lessons.ARTIFACT_SCHEMA_VERSION,
    id: entry.id,
    lang: ctx.lang,
    level: ctx.level,
    locales: ['en', 'fr', 'de'],
    title: file.title,
    objective: file.objective,
    estimatedMinutes: file.estimatedMinutes,
    provenance,
    kind: entry.kind,
    ...(entry.kind === 'grammar' ? { topic: entry.topic } : { theme: entry.theme }),
  };
  return { ...head, ...file, ...head };
}

/**
 * Returns the completed files; `draft` itself is not changed.
 *
 * The brief's provenance hashes the outline entry; the content's hashes the
 * entry and the final brief, since the content is written from the brief.
 */
export function complete(draft: Draft, ctx: CompleteContext): Draft {
  const generatedAt = new Date().toISOString();
  const outline = sha256({ entry: ctx.entry, lang: ctx.lang, level: ctx.level });
  const provenance = (inputHashes: Json) => ({
    generator: GENERATOR,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    generatedAt,
    inputHashes,
  });

  const raw = structuredClone(draft);
  const brief = withEnvelope(isObject(raw.brief) ? raw.brief : {}, ctx, provenance({ outline }));
  brief.scoring = SCORING;
  // A vocabulary lesson has no content file: whatever the model sent is dropped.
  const content =
    lessons.hasContentFile(ctx.entry.kind) && isObject(raw.content)
      ? { ...raw.content, title: brief.title, objective: brief.objective }
      : undefined;

  computeTimes(ctx.entry.kind, brief, content, ctx.level);
  if (!content) return { brief };
  return {
    brief,
    content: withEnvelope(content, ctx, provenance({ outline, brief: sha256(brief) })),
  };
}
