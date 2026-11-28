import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TutorAnswer, TutorThinking } from './tutor-answer';

/** The answer as the server draws it: no DOM, as the other component tests. */
const html = (text: string, cut = false) =>
  renderToStaticMarkup(<TutorAnswer text={text} cut={cut} />);

describe('TutorAnswer', () => {
  it('renders the Markdown the model writes, with no * or # left', () => {
    const out = html(
      [
        '### Your mistakes',
        '',
        'You wrote **je suis allé** but *elle*:',
        '',
        '* the participle agrees',
        '* with the subject',
        '',
        '1. first',
        '2. second',
      ].join('\n'),
    );
    expect(out).toContain('<strong class="font-semibold text-slate-100">je suis allé</strong>');
    expect(out).toContain('<em class="italic">elle</em>');
    expect(out).toMatch(/<ul [^>]*list-disc[^>]*>\s*<li>the participle agrees<\/li>/);
    expect(out).toMatch(/<ol [^>]*list-decimal/);
    expect(out).toContain('>Your mistakes</p>');
    expect(out).not.toMatch(/[*#]/);
  });

  it('renders a table and strikethrough (GFM), each cell in its own box', () => {
    const out = html(
      [
        '| Pronoun | être |',
        '| :-- | --: |',
        '| je | suis |',
        '| tu | es |',
        '',
        'Not ~~allé~~ but **allée**.',
      ].join('\n'),
    );
    expect(out).toMatch(/<div class="overflow-x-auto"><table [^>]*>/);
    expect(out).toMatch(/<th [^>]*>Pronoun<\/th>/);
    expect(out).toMatch(/<td [^>]*>suis<\/td>/);
    expect(out).toContain('style="text-align:right"');
    expect(out).toMatch(/<del [^>]*>allé<\/del>/);
    expect(out).not.toMatch(/[|~]/);
  });

  it('opens a link in a new tab, but keeps a footnote link on the page', () => {
    const out = html('See [the docs](https://example.com)[^1].\n\n[^1]: A note.');
    expect(out).toContain(
      'href="https://example.com" target="_blank" rel="noopener noreferrer nofollow"',
    );
    expect(out).toMatch(/<a href="#user-content-fn-1" class="underline">/);
  });

  it('shows raw HTML as text, never as markup', () => {
    const out = html('Look: <script>alert(1)</script> and <img src=x onerror="alert(2)">');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('shows no image and no javascript: link', () => {
    const out = html('![pixel](https://example.com/p.png) [click](javascript:alert(1))');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('javascript:');
  });

  it('trails a cut answer off at the end of its last block, not on a line of its own', () => {
    expect(html('Half an answer', true)).toContain(
      '[&amp;&gt;:last-child]:after:content-[&#x27;…&#x27;]',
    );
    expect(html('A whole answer')).not.toContain('after:content');
  });
});

describe('TutorThinking', () => {
  it('shows three dots where the answer will start, seen only, still under reduced motion', () => {
    const out = renderToStaticMarkup(
      <ol>
        <TutorThinking />
      </ol>,
    );
    expect(out).toContain('data-slot="tutor-thinking" aria-hidden="true"');
    expect(out.match(/<span class="size-2 rounded-full/g)).toHaveLength(3);
    expect(out.match(/motion-safe:animate-bounce/g)).toHaveLength(3);
    expect(out).not.toMatch(/[\s"]animate-bounce/); // never animated without motion-safe:
    expect(out).not.toContain('data-turn'); // e2e counts [data-turn="assistant"]
  });
});
