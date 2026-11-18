import { describe, expect, it } from 'vitest';

import { clock, markKeywords, readSkim, secondsLeft, skimValue } from './reading';

const marked = (paragraph: string, highlights: string[]) =>
  markKeywords(paragraph, highlights)
    .map((s) => (s.mark ? `[${s.text}]` : s.text))
    .join('');

describe('markKeywords', () => {
  it('marks every occurrence of a key word', () => {
    expect(marked('Mais avant, on se voit. Dis-le-moi avant vendredi.', ['avant'])).toBe(
      'Mais [avant], on se voit. Dis-le-moi [avant] vendredi.',
    );
  });

  it('marks the longest key word where two overlap', () => {
    expect(marked('on se voit à 15 h', ['on', 'on se voit'])).toBe('[on se voit] à 15 h');
  });

  it('marks whole words only', () => {
    expect(marked('Auparavant, avant le café.', ['avant'])).toBe('Auparavant, [avant] le café.');
    expect(marked('le coucher du soleil.', ['coucher du soleil'])).toBe('le [coucher du soleil].');
    expect(marked("l'été, c'est fermé.", ['fermé'])).toBe("l'été, c'est [fermé].");
  });

  it('keeps the text whole and in order', () => {
    const text = 'Salut Tom ! Tu es libre samedi après-midi ?';
    const segments = markKeywords(text, ['samedi', 'Tom', '', 'absent']);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.mark).map((s) => s.text)).toEqual(['Tom', 'samedi']);
  });

  it('returns the paragraph as one plain piece without key words', () => {
    expect(markKeywords('Bonjour.', [])).toEqual([{ text: 'Bonjour.', mark: false }]);
  });
});

describe('the skim countdown', () => {
  const now = 1_000_000;

  it('starts a countdown of its seconds when nothing was kept', () => {
    expect(readSkim(null, now, 45)).toEqual({ phase: 'reading', deadline: now + 45_000 });
  });

  it('keeps the deadline across a reload, so the time never grows', () => {
    const kept = skimValue({ phase: 'reading', deadline: now + 10_000 });
    expect(readSkim(kept, now, 45)).toEqual({ phase: 'reading', deadline: now + 10_000 });
  });

  it('opens the question when the kept deadline has passed', () => {
    const kept = skimValue({ phase: 'reading', deadline: now - 1 });
    expect(readSkim(kept, now, 45)).toEqual({ phase: 'question' });
  });

  it('keeps the question open once the document was put away', () => {
    expect(readSkim(skimValue({ phase: 'question' }), now, 45)).toEqual({ phase: 'question' });
  });

  it('starts again on a value it did not write', () => {
    expect(readSkim('reading:9999999999999', now, 45)).toEqual({
      phase: 'reading',
      deadline: now + 45_000,
    });
    expect(readSkim('garbage', now, 45)).toEqual({ phase: 'reading', deadline: now + 45_000 });
  });

  it('counts whole seconds down to zero', () => {
    expect(secondsLeft(now + 44_001, now)).toBe(45);
    expect(secondsLeft(now + 1, now)).toBe(1);
    expect(secondsLeft(now - 5_000, now)).toBe(0);
  });

  it('shows m:ss', () => {
    expect(clock(45)).toBe('0:45');
    expect(clock(70)).toBe('1:10');
    expect(clock(0)).toBe('0:00');
  });
});
