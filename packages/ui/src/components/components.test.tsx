import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button, Card, cn, ProgressBar, progressPercent } from '../index';

// renderToStaticMarkup keeps this package free of jsdom and a DOM testing
// library. It also exercises the exact path Next uses to server render @ft/ui.

describe('cn', () => {
  it('joins truthy class names and drops the rest', () => {
    expect(cn('a', undefined, 'b', null, false, '')).toBe('a b');
    expect(cn()).toBe('');
  });
});

describe('Button', () => {
  it('defaults to type=button so it cannot submit a form by accident', () => {
    const html = renderToStaticMarkup(<Button>Start</Button>);

    expect(html).toContain('type="button"');
    expect(html).toContain('>Start</button>');
    expect(html).toContain('bg-indigo-600');
    expect(html).toContain('h-10');
  });

  it('applies the requested variant, size and extra classes', () => {
    const html = renderToStaticMarkup(
      <Button variant="ghost" size="lg" className="w-full" disabled>
        Later
      </Button>,
    );

    expect(html).toContain('bg-transparent');
    expect(html).toContain('h-12');
    expect(html).toContain('w-full');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('bg-indigo-600');
  });

  it('honours an explicit submit type', () => {
    expect(renderToStaticMarkup(<Button type="submit">Send</Button>)).toContain('type="submit"');
  });
});

describe('Card', () => {
  it('renders children only when no heading or footer is given', () => {
    const html = renderToStaticMarkup(<Card>body</Card>);

    expect(html).toContain('body');
    expect(html).not.toContain('<h3');
    expect(html).not.toContain('border-t');
  });

  it('renders the heading, the footer and forwarded attributes', () => {
    const html = renderToStaticMarkup(
      <Card heading="Lesson 1" footer="3 of 8" className="mt-2" aria-label="lesson">
        body
      </Card>,
    );

    expect(html).toContain('<h3');
    expect(html).toContain('Lesson 1');
    expect(html).toContain('3 of 8');
    expect(html).toContain('mt-2');
    expect(html).toContain('aria-label="lesson"');
  });
});

describe('ProgressBar', () => {
  it('fills to the share of max and names itself', () => {
    const html = renderToStaticMarkup(<ProgressBar value={2} max={6} label="Daily goal" />);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Daily goal"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain('width:33%');
  });

  // A goal raised after it was met can never overflow, and a lowered one
  // leaves more done than the target: both stop at full.
  it('stops at full when the value passes max', () => {
    const html = renderToStaticMarkup(<ProgressBar value={5} max={3} label="Daily goal" />);

    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('width:100%');
  });

  it('reads an empty max as empty instead of dividing by zero', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(-1, 4)).toBe(0);
    expect(progressPercent(4, 4)).toBe(100);
  });
});
