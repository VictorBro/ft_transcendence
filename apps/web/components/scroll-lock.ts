'use client';

import { useEffect } from 'react';

/** How many open overlays hold the lock: the two header menus may overlap a moment. */
let holders = 0;

/**
 * Stops the page from scrolling while an overlay is open, so a swipe on the
 * dimmed page behind a menu does not move it. The scrollbar's width goes to
 * padding while it is hidden, so a desktop page does not shift sideways.
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    if (holders === 0) {
      const scrollbar = window.innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders === 0) {
        root.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, [locked]);
}
