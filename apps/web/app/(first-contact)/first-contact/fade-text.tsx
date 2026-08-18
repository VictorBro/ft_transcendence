// Server components cannot hold state or run timers: they render once on the
// server and are done. This one needs both, so it crosses into the browser.
// The page above stays a server component, which is what lets it keep
// requireUser() — a client component could not read the session cookie.
'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Must remain synchronized with --fade-duration in globals.css.
const FADE_MS = 500;

type FadeTextProps = {
  children: ReactNode;
  /** Time at full opacity, fades excluded. Total on screen is this + 2 × FADE_MS. */
  holdMs?: number;
  /** Delay before the entrance starts, to stagger one line after another. */
  delayMs?: number;
  /** Called once the exit has finished, so a parent can advance the sequence. */
  onDone?: () => void;
};

type Phase = 'waiting' | 'in' | 'out' | 'gone';

export function FadeText({ children, holdMs = 500, delayMs = 0, onDone }: FadeTextProps) {
  const [phase, setPhase] = useState<Phase>('waiting');

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase('out'), delayMs + FADE_MS + holdMs),
      window.setTimeout(
        () => {
          setPhase('gone');
          onDone?.();
        },
        delayMs + FADE_MS + holdMs + FADE_MS,
      ),
    ];

    return () => timers.forEach(window.clearTimeout);
  }, [holdMs, delayMs, onDone]);

  if (phase === 'gone') return null;

  const classes: Record<Phase, string> = {
    waiting: 'animate-fade-in',
    in: 'animate-fade-in',
    out: 'animate-fade-out',
    gone: '',
  };

  return (
    <div
      key={phase}
      className={classes[phase]}
      style={{ animationDelay: phase === 'out' ? '0ms' : `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
