import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import { Field, PasswordField } from './form';

/**
 * As the server draws them: renderToStaticMarkup runs no effect and takes the
 * server snapshot, so a PasswordField here is what a browser without
 * JavaScript gets.
 */
const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

/** The id useId gave the field, read from its label. */
const labelId = (out: string) => {
  const id = /<label for="([^"]+)"/.exec(out)?.[1];
  if (!id) throw new Error(`No label in ${out}`);
  return id;
};

describe('PasswordField', () => {
  it('is a plain password field as the server draws it', () => {
    const out = html(
      <PasswordField label="Password" name="password" autoComplete="current-password" />,
    );

    expect(out).toMatch(/<input [^>]*type="password"/);
    expect(out).toMatch(/autocomplete="current-password"/i);
    expect(out).toContain('name="password"');
    // The button is drawn once hydrated: without JavaScript it would do nothing.
    expect(out).not.toContain('<button');
  });

  it('ties the label and the hint to the input', () => {
    const out = html(
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        hint="At least 12 characters."
      />,
    );
    const id = labelId(out);

    expect(out).toContain(`id="${id}"`);
    expect(out).toContain(`aria-describedby="${id}-hint"`);
    expect(out).toContain(`<p id="${id}-hint"`);
  });

  it('is never spellchecked, corrected or capitalised', () => {
    const out = html(
      <PasswordField label="Password" name="password" autoComplete="new-password" />,
    );

    expect(out).toMatch(/spellcheck="false"/i);
    expect(out).toMatch(/autocorrect="off"/i);
    expect(out).toMatch(/autocapitalize="none"/i);
  });
});

describe('Field', () => {
  // PasswordField shares its frame: Field's own markup must not move with it.
  it('keeps its markup: a label, the input, no hint', () => {
    const out = html(<Field label="Email" name="email" type="email" />);
    const id = labelId(out);

    expect(out).toBe(
      `<div class="flex flex-col gap-2"><label for="${id}" class="text-sm font-medium">Email</label>` +
        `<input id="${id}" class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100" type="email" name="email"/></div>`,
    );
  });
});
