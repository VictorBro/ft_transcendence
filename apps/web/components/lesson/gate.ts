'use client';

import { useEffect } from 'react';

import type { AnswerProps, Gate } from './types';

/**
 * Holds the player's main button while `gate` is set: set on every change,
 * cleared when it turns null, when the key changes, and when the item goes
 * (the next page).
 */
export function useGate(onGate: AnswerProps['onGate'], key: string, gate: Gate | null): void {
  const message = gate?.message;
  const mode = gate?.mode;
  useEffect(() => {
    onGate(key, message !== undefined && mode !== undefined ? { message, mode } : null);
  }, [onGate, key, message, mode]);
  useEffect(() => () => onGate(key, null), [onGate, key]);
}
