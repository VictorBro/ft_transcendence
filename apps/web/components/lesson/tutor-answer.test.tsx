import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TutorAnswer } from './tutor-answer';

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
