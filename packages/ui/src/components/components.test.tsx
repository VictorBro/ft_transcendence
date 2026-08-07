import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button, Card, cn } from '../index';

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
