import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LessonOutlineFileSchema } from '../../schemas/lesson';
import { functionsPageEstimate, functionsTimeLimit } from '../domain/functionsLesson';
import { briefSchema, contentSchema, isSupportedKind } from '../schemas/artifacts';
import type { FunctionsContent } from '../schemas/functions';
import { validateBrief, validateContent, type OutlineContext } from './artifacts';

/**
 * Ported from the lesson prototype (describe('function artifacts') of
 * tests/unit/functions.test.tsx at 928484d), on its sample lessons in
 * packages/shared/test/fixtures/samples.
 */

const SAMPLES = join(__dirname, '../../../test/fixtures/samples');
const ID = 'fr-ordering-at-a-cafe';
// The samples are edited freely by each test, so they are read untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const read = (dir: 'briefs' | 'lessons', id: string): Json =>
  JSON.parse(readFileSync(join(SAMPLES, dir, `${id}.json`), 'utf8'));
const load = (dir: 'briefs' | 'lessons'): Json => read(dir, ID);
const outline = LessonOutlineFileSchema.parse(
  JSON.parse(readFileSync(join(SAMPLES, 'outlines/fr-a1.json'), 'utf8')),
);
const ctxOf = (id: string): OutlineContext => ({
  entry: outline.entries.find((e) => e.id === id)!,
  lang: 'fr',
  level: 'A1',
});
const ctx = ctxOf(ID);
const messages = (r: { issues: { path: string; message: string }[] }) =>
  r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');

function checkBrief(mutate?: (b: Json) => void) {
  const brief = load('briefs');
  mutate?.(brief);
  return validateBrief(brief, ctx);
}
function checkContent(mutate?: (c: Json) => void) {
  const content = load('lessons');
  mutate?.(content);
  return validateContent(content, { ...ctx, brief: load('briefs') });
}
const step = (c: Json, stage: string) => c.steps.find((s: Json) => s.stage === stage);

describe('function artifacts', () => {
  it('registers functions as a supported kind', () => {
    expect(isSupportedKind('functions')).toBe(true);
    expect(() => z.toJSONSchema(briefSchema('functions', 'fr'))).not.toThrow();
    expect(() => z.toJSONSchema(contentSchema('functions', 'fr'))).not.toThrow();
  });

  it('accepts the sample brief and lesson content', () => {
    expect(messages(checkBrief())).toBe('');
    expect(messages(checkContent())).toBe('');
  });

  it.each([
    ['too few expressions', (b: Json) => b.expressions.splice(3), /expressions/],
    [
      'an ellipsis in the text',
      (b: Json) => (b.expressions[0].text = 'Je voudrais …'),
      /without the ellipsis and set openEnd/,
    ],
    [
      'an example without its expression',
      (b: Json) => (b.expressions[1].example.text = 'Bonjour.'),
      /must use the expression/,
    ],
    [
      'a noun without article',
      (b: Json) => (b.words[0].teachingForm = 'thé'),
      /indefinite article/,
    ],
    [
      'equal translations',
      (b: Json) => (b.expressions[0].translations.en = ['I would like']),
      /en translation/,
    ],
  ])('rejects a brief with %s', (_, mutate, pattern) => {
    expect(messages(checkBrief(mutate))).toMatch(pattern);
  });

  it.each([
    [
      'a missing expression in the dialogue',
      (c: Json) =>
        step(c, 'dialogue').pages[0].items[0].lines.forEach(
          (l: Json) =>
            (l.expressionIds = l.expressionIds.filter((e: string) => e !== 'cest-combien')),
        ),
      /does not use expression cest-combien/,
    ],
    [
      'two lines of one role in a row',
      (c: Json) => (step(c, 'dialogue').pages[0].items[0].lines[1].roleId = 'serveur'),
      /roles alternate/,
    ],
    [
      'a distractor in practice',
      (c: Json) => (step(c, 'word_order').pages[0].items[0].distractorTokenIds = ['t3']),
      /tokens only/,
    ],
    [
      'a distractor inside the accepted order',
      (c: Json) => (step(c, 'exam').pages[1].items[0].distractorTokenIds = ['t1']),
      /except the distractors/,
    ],
    [
      'a gap without its answer among the choices',
      (c: Json) =>
        (step(c, 'dialogue_gaps').pages[0].items[0].choiceExpressionIds[0] = 'laddition'),
      /four distinct expressions including the answer/,
    ],
    [
      'an exam reply taken from practice',
      (c: Json) => {
        const reply = step(c, 'exam').pages[1].items[0];
        reply.tokens = [
          { tokenId: 't1', text: 'Je' },
          { tokenId: 't2', text: 'voudrais' },
          { tokenId: 't3', text: 'un thé,' },
          { tokenId: 't4', text: 's’il vous plaît' },
        ];
        reply.distractorTokenIds = [];
        reply.acceptedOrders = [['t1', 't2', 't3', 't4']];
      },
      /already occurs in the brief or in practice/,
    ],
    [
      'an exam dialogue line taken from practice',
      (c: Json) => {
        const line = step(c, 'exam').pages[2].items[0].lines[1];
        const model = step(c, 'dialogue').pages[0].items[0].lines;
        line.before = '';
        line.after = '';
        line.gap.accepted.answers = [model[1].text];
      },
      /the line already occurs in the brief or in practice/,
    ],
    [
      'two exam dialogue lines of one role in a row',
      (c: Json) => {
        const lines = step(c, 'exam').pages[2].items[0].lines;
        lines[1].roleId = lines[0].roleId;
      },
      /exam\.dialogue\.lines\.1: the roles alternate/,
    ],
    [
      'a wrong page estimate',
      (c: Json) => (step(c, 'dialogue').pages[0].estimatedDurationS = 60),
      /must be 140 s by FUNCTIONS_PAGE_RULES/,
    ],
    [
      'a wrong exam limit',
      (c: Json) => (step(c, 'exam').pages[2].timeLimitS = 100),
      /must be 264 s/,
    ],
    [
      'a practice countdown',
      (c: Json) => (step(c, 'matching').pages[0].timeLimitS = 60),
      /only exam pages have a countdown/,
    ],
    ['steps out of order', (c: Json) => c.steps.reverse(), /expected the flashcards step/],
  ])('rejects lesson content with %s', (_, mutate, pattern) => {
    expect(messages(checkContent(mutate))).toMatch(pattern);
  });

  it('asks the gender of nouns only; other words are left out of the gender page', () => {
    const otherId = 'fr-greetings-and-goodbyes';
    const otherCtx = { ...ctxOf(otherId), brief: read('briefs', otherId) };
    const content = read('lessons', otherId);
    expect(step(content, 'gender').pages[0].items[0].ids).toEqual(['matin', 'soir']);
    expect(messages(validateContent(content, otherCtx))).toBe('');
    step(content, 'gender').pages[0].items[0].ids.push('tres-bien', 'pas-mal');
    expect(messages(validateContent(content, otherCtx))).toMatch(
      /one gender page with every noun in brief order/,
    );
  });

  it('derives page estimates and exam limits from the page rules', () => {
    const content = load('lessons') as FunctionsContent;
    const exam = content.steps.at(-1)!.pages;
    expect(functionsPageEstimate(exam[0].items, true)).toBe(4 * 15); // word translation
    expect(exam[0].timeLimitS).toBe(90);
    expect(functionsPageEstimate(exam[1].items, true)).toBe(4 * 30);
    expect(functionsPageEstimate(exam[2].items, true)).toBe(12 * 8 + 4 * 20);
    expect(functionsTimeLimit(176)).toBe(264);
    expect(
      functionsPageEstimate(content.steps.find((s) => s.stage === 'gender')!.pages[0].items, false),
    ).toBe(20 + 4 * 5);
    expect(
      functionsPageEstimate(
        content.steps.find((s) => s.stage === 'listening')!.pages[0].items,
        false,
      ),
    ).toBe(30);
    expect(content.estimatedMinutes).toBe(17);
  });
});
