'use client';

import { useCallback, useState } from 'react';
import { FadeText } from './fade-text';

import Link from 'next/link';

const GAP_MS = 600;

type Phrase = {
  text: string;
  /** Time at full opacity. The two 500ms fades are added around it. */
  holdMs: number;
  /** Blank-screen wait before entering. Defaults to GAP_MS, except for the first. */
  delayMs?: number;
  /** Tailwind size classes, written out in full (see the note). */
  className: string;
};

// The explicit type is required: without it, `as const` produces a union of two
// object literals where only one carries delayMs, and accessing it fails to compile.
const PHRASES: readonly Phrase[] = [
  {
    text: 'Hello',
    holdMs: 1000,
    delayMs: 1000,
    className: 'text-6xl sm:text-7xl lg:text-7xl',
  },
  {
    text: 'Welcome to your first contact with your IA tutor.',
    holdMs: 2300,
    className: 'text-5xl sm:text-5xl lg:text-5xl max-w-2xl',
  },
  {
    text: 'We are going to evaluate your language level, from A1 to C2.',
    holdMs: 2800,
    className: 'text-5xl sm:text-5xl lg:text-5xl max-w-4xl',
  },
  {
    text: "Let's go for it.",
    holdMs: 1500,
    className: 'text-5xl sm:text-6xl lg:text-6xl',
  },
];

export function GreetingSequence() {
  const [idx, setIdx] = useState(0);

  // FadeText keeps onDone in its useEffect deps: a function recreated on every
  // render would restart its timers. useCallback pins it down.
  const next = useCallback(() => setIdx((i) => i + 1), []);

  const phrase = PHRASES[idx];
  if (phrase === undefined) {
    return (
      <div className="animate-fade-in" style={{ animationDelay: `${GAP_MS}ms` }}>
        <h1 className="text-2xl font-bold tracking-tight">
          This will be the page where the user select the language to learn
        </h1>
        <Link
          href="/dashboard"
          className="mx-auto mt-8 flex w-fit items-center rounded-full bg-indigo-700 px-20 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 active:bg-indigo-900"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  const delayMs = phrase.delayMs ?? (idx === 0 ? 0 : GAP_MS);

  return (
    // The key remounts FadeText on each phrase: it restarts in 'waiting',
    // so it replays its full cycle instead of staying 'gone'.
    <FadeText key={idx} holdMs={phrase.holdMs} delayMs={delayMs} onDone={next}>
      <h1 className={`${phrase.className} font-bold tracking-tight text-balance`}>{phrase.text}</h1>
    </FadeText>
  );
}
