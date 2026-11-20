import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { lessons } from '@ft/shared';

import en from '@/messages/en.json';
import type { Answer, ItemProps, Ref, UnitFeedback } from '../types';

type PageView = lessons.player.PageView;
import { ITEM_RENDERERS, playable, START_FIELDS } from './index';
import { SkimOpen } from './reading';

/**
 * The reading kind (#148) played on PR #142's sample, "Lire un SMS", the
 * lesson of the screens in docs/mockups/lessons/reading/. The attempt runs
 * on the shared core, as the API runs it; each page is rendered with the
 * kind's renderers as the player renders it: open, with the learner's
 * answers, and checked with the feedback the core gives.
 *
 * renderToStaticMarkup, as packages/ui: no DOM and no effect, so a skim
 * page is as the server draws it, before the kept countdown is read: no
 * document yet, and the question in the markup, hidden by lesson.css while
 * the page is marked data-skim="reading". The open document is rendered on
 * its own (SkimOpen), as the page draws it once hydrated.
 */

const SAMPLES = join(__dirname, '../../../../../packages/shared/test/fixtures/samples');
const ID = 'fr-reading-a-text-message';
const read = (path: string): unknown => JSON.parse(readFileSync(join(SAMPLES, path), 'utf8'));
const source = {
  brief: read(`briefs/${ID}.json`),
  content: read(`lessons/${ID}.json`),
} as lessons.player.LessonSource;

const plan = lessons.player.buildPlan(source, 'en');
const outline = lessons.player.lessonOutline(plan);
const { paths } = lessons.player;
const ref: lessons.player.RefOf = (path) =>
  createHmac('sha256', 'test').update(path).digest('base64url').slice(0, 16);
const ATTEMPT = '6f1c2b8e-3d4a-4e5f-9a6b-7c8d9e0f1a2b';

type PlanPage = lessons.player.PlanPage;
type PlanUnit = lessons.player.PlanUnit;

/** The learner's answer to a unit, right or wrong, with the refs the browser has. */
function answerOf(page: PlanPage, unit: PlanUnit, right: boolean): Answer {
  if (unit.kind === 'choice') {
    const option = right
      ? unit.correct[0]!
      : unit.options.find((o) => !unit.correct.includes(o.id))!.id;
    return { option: ref(paths.option(page, unit.itemId, option)) };
  }
  if (unit.kind === 'order') {
    const order = right ? unit.acceptedOrders[0]! : [...unit.acceptedOrders[0]!].reverse();
    return { tokens: order.map((t) => ref(paths.token(page, unit.itemId, t))) };
  }
  throw new Error(`No ${unit.kind} unit in a reading lesson`);
}

/** Renders a page's items the way the player does, inside its .lesson-items. */
function render(
  page: PageView,
  answers: Record<Ref, Answer> = {},
  feedback: UnitFeedback[] | null = null,
): string {
  const props: Omit<ItemProps, 'item'> = {
    lang: 'fr',
    answers,
    onAnswer: () => {},
    feedback: feedback ? new Map(feedback.map((f) => [f.ref, f])) : null,
    locked: feedback !== null,
    hold: () => {},
    nudged: false,
    keep: { load: () => null, save: () => {} },
    outline,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div className="lesson-items">
        {page.items.map((item, n) => {
          const Renderer = ITEM_RENDERERS[item.type] as React.ComponentType<ItemProps> | undefined;
          if (!Renderer) throw new Error(`No renderer for ${item.type}`);
          return <Renderer key={n} item={item} {...props} />;
        })}
      </div>
    </NextIntlClientProvider>,
  );
}

/** The text of the markup, without its tags. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
const stage = (page: PlanPage) => plan.pages.indexOf(page);

/** Plays the sample through the core: every page rendered open, then checked. */
function play(right: (unit: PlanUnit) => boolean) {
  let state = lessons.player.start(plan, 0);
  const pages: { open: string; checked: string | null; view: PageView }[] = [];
  for (let now = 0; state.completedAt === null; now += 1000) {
    const view = lessons.player.view(plan, state, ATTEMPT, ref, now).current!;
    const planPage = plan.pages[view.index]!;
    const answers = Object.fromEntries(
      planPage.units.map((u) => [ref(paths.unit(u)), answerOf(planPage, u, right(u))]),
    );
    const result = lessons.player.submit(plan, state, view.index, answers, now, ref);
    if (!result.ok) throw new Error(result.error);
    pages.push({
      open: render(view, answers),
      checked: result.feedback ? render(view, answers, result.feedback) : null,
      view,
    });
    state = result.state;
  }
  return { pages, results: lessons.player.results(plan, state) };
}

/** The page of a step; the exam step's info page comes before its exam page. */
const byStep = (step: string) =>
  plan.pages.find((p) => p.stepId === step && p.role !== 'examIntro')!;

describe('the reading lesson (#148) on PR #142 sample', () => {
  const right = play(() => true);
  const html = (step: string) => right.pages[stage(byStep(step))]!;

  it('is playable, and plays to Score 100 with every answer right', () => {
    expect(playable('reading')).toBe(true);
    expect(right.pages).toHaveLength(plan.pages.length);
    expect(right.results.score).toBe(100);
  });

  it('shows the key word count on the lesson page, and neither the situation nor the genre', () => {
    const page = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {START_FIELDS.map((Field, n) => (
          <Field key={n} outline={outline} lang="fr" />
        ))}
      </NextIntlClientProvider>,
    );
    expect(text(page)).toBe('5 key words');
    // The situation answers the skim question ("to plan Saturday" before "Why does Léa write?").
    const situation = (source.brief as { situation: Record<string, string> }).situation;
    for (const line of Object.values(situation)) {
      expect(JSON.stringify(outline)).not.toContain(line);
    }
    expect(JSON.stringify(outline)).not.toContain('text_message');
  });

  it('turns key word cards with their meanings on the front, and no explanation', () => {
    const { open } = html('flashcards');
    expect(text(open)).toContain('0 of 5 cards turned');
    expect(text(open)).toContain('after / afterwards');
    expect(open.match(/aria-label="Turn the card: /g)).toHaveLength(5);
    expect(open).not.toContain('lesson-flashcard-explanation');
  });

  it('matches the key words with their meanings on the board', () => {
    const { open } = html('matching');
    for (const word of ['samedi', 'on se voit', 'la gare', 'avant', 'après']) {
      expect(text(open)).toContain(word);
    }
    expect(text(open)).toContain('the train station');
  });

  it('skims with the countdown, then asks the question from memory', () => {
    const { open, checked, view } = html('skim');
    // Before hydration: marked as reading, so the question is held back, and
    // nothing of the document, which a reload after the skim must not show.
    expect(open).toContain('data-skim="reading"');
    expect(open).not.toContain('reading-document');
    expect(text(open)).not.toContain('Time to skim');
    expect(text(open)).not.toContain('Jeudi 18:42');
    expect(open).toContain('reading-skim-question');
    expect(text(open)).toContain('Answer from memory');

    // Hydrated: the document is open, with its countdown.
    const item = view.items.find((i) => i.type === 'reading_document')!;
    if (item.type !== 'reading_document') throw new Error('no document');
    const reading = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <SkimOpen
          document={item.document}
          lang="fr"
          seconds={item.skimSeconds!}
          left={item.skimSeconds!}
          onFinish={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(text(reading)).toContain('Time to skim');
    expect(text(reading)).toContain('0:45');
    // The time is the timer, and its name gives the time left.
    expect(reading).toContain('role="timer" aria-label="Time to skim: 0:45"');
    expect(text(reading)).toContain("I've finished reading");
    expect(text(reading)).toContain(
      'The question opens when the time is up or when you have finished reading.',
    );
    // The meta line, and every key word marked where it is in the text (avant twice).
    expect(reading).toContain('<span>Léa</span><span>Jeudi 18:42</span>');
    expect(reading.match(/<mark class="reading-keyword">/g)).toHaveLength(6);
    expect(reading).toContain('<mark class="reading-keyword">Après</mark>');
    // Checked: the document is back above the question, and the note says Correct.
    expect(checked).toContain('data-skim="checked"');
    expect(checked).not.toContain('Time to skim');
    expect(checked).toContain('class="reading-note is-right" data-outcome="fully_correct"');
  });

  it('puts the detail questions beside the document, true or false in French', () => {
    const { open } = html('detail');
    expect(open).toContain('reading-doc-slot is-side');
    // The side document is a named region a keyboard can focus, to scroll it.
    expect(open).toContain('role="region" aria-label="Document" tabindex="0"');
    // Each radio group is named after its question, not "Choose an answer".
    expect(open).not.toContain('aria-label="Choose an answer"');
    const ids = [...open.matchAll(/<p id="([^"]+)" lang="fr" class="reading-question-prompt">/g)];
    expect(ids).toHaveLength(4);
    for (const [, id] of ids) expect(open).toContain(`role="radiogroup" aria-labelledby="${id}"`);
    expect(open.match(/class="reading-question /g)).toHaveLength(4);
    expect(text(open)).toContain('Quel jour Léa propose-t-elle de se voir ?');
    expect(text(open)).toContain('Vrai');
    expect(text(open)).toContain('Faux');
  });

  it('orders the pieces beside the document', () => {
    const { open, checked } = html('structure');
    expect(open).toContain('reading-doc-slot is-side');
    // The interface's labels are not tagged with the course language; the pieces are.
    expect(open).toMatch(/<div role="group" aria-label="Pieces to place" data-order-side="bank"/);
    expect(checked).toContain(
      'role="status" class="reading-note is-right" data-outcome="fully_correct"',
    );
    // A placed piece is named in the interface's language, the piece in French.
    expect(checked).toMatch(
      /<span id="[^"]+" hidden="">Remove <span lang="fr">[^<]+<\/span><\/span>/,
    );
  });

  it('shows the second document only on the exam page, with no key word marked', () => {
    const { open, checked, view } = html('exam');
    expect(checked).toBeNull();
    expect(view.role).toBe('exam');
    expect(open).toContain('role="region" aria-label="Exam document"');
    expect(open).toContain('<span>Paul</span><span>Vendredi 9:15</span>');
    expect(open).not.toContain('<mark');
    expect(open).not.toContain('Jeudi 18:42');
    expect(open.match(/class="reading-question /g)).toHaveLength(5);
    // The exam document comes with the exam page, and with no other.
    for (const page of right.pages.filter((p) => p.view.role !== 'exam')) {
      expect(page.open).not.toContain('Vendredi 9:15');
    }
  });
});

describe('a reading lesson answered wrong', () => {
  const wrong = play(() => false);
  const at = (step: string) => wrong.pages[stage(byStep(step))]!;

  it('marks a wrong choice: the right answer in green, the learner’s struck, and why', () => {
    const { checked } = at('detail');
    const detail = byStep('detail');
    const unit = detail.units.find((u) => u.kind === 'choice')!;
    if (unit.kind !== 'choice') throw new Error('not a choice');
    const picked = unit.options.find((o) => !unit.correct.includes(o.id))!.text;
    expect(checked).toContain('class="reading-note is-wrong" data-outcome="incorrect"');
    expect(text(checked!)).toContain('Incorrect');
    // Each line says which it is to a screen reader; the colours say it on screen.
    expect(checked).toContain(
      `<p class="font-semibold text-green-400"><span class="sr-only">Correct answer: </span><span lang="fr">${unit.answer}</span></p>`,
    );
    expect(checked).toContain(
      `<p class="text-red-400 line-through"><span class="sr-only">Your answer: </span><span lang="fr">${picked}</span></p>`,
    );
    expect(text(checked!)).toContain(unit.explanation.en);
  });

  it('marks a wrong order with the right one and the learner’s, joined by arrows', () => {
    const { checked } = at('structure');
    const unit = byStep('structure').units.find((u) => u.kind === 'order')!;
    if (unit.kind !== 'order') throw new Error('not an order');
    expect(checked).toContain('class="reading-note is-wrong" data-outcome="incorrect"');
    expect(text(checked!)).toContain('Incorrect');
    expect(text(checked!)).toContain(unit.answer);
    const reversed = [...unit.acceptedOrders[0]!]
      .reverse()
      .map((id) => unit.tokens.find((t) => t.id === id)!.text)
      .join(lessons.player.ORDER_SEPARATOR);
    expect(text(checked!)).toContain(reversed);
  });

  it('plays to the results with no point', () => {
    expect(wrong.results.score).toBe(0);
  });
});
