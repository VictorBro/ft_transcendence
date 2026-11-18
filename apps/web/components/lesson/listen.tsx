'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

/*
 * Speech through the browser's speechSynthesis (#147): a Listen button
 * reads a course-language text aloud. Nothing in a lesson needs it, so
 * without a voice for the language the button is not there at all, and
 * the lesson plays on. The server render has no voice either: the button
 * appears after hydration, when the browser has one.
 */

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/** The browser's voices for `lang` (fr matches fr-FR and fr-CA), best match first. */
function voicesFor(lang: string): SpeechSynthesisVoice[] {
  const voices = synth()?.getVoices() ?? [];
  const of = voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === lang);
  // The local voice of the main region first: fr-FR before fr-CA, offline before online.
  return of.sort(
    (a, b) =>
      Number(b.lang.toLowerCase() === `${lang}-${lang}`) -
        Number(a.lang.toLowerCase() === `${lang}-${lang}`) ||
      Number(b.localService) - Number(a.localService),
  );
}

/** Voices load late in Chrome: a store over voiceschanged. */
function subscribe(changed: () => void): () => void {
  const s = synth();
  s?.addEventListener('voiceschanged', changed);
  return () => s?.removeEventListener('voiceschanged', changed);
}

/** The voice that reads `lang`, by its URI (a string, so the snapshot is stable); null without one. */
export function useVoice(lang: Language): string | null {
  return useSyncExternalStore(
    subscribe,
    () => voicesFor(lang)[0]?.voiceURI ?? null,
    () => null,
  );
}

/** Reads `text` aloud with the voice `uri`, cutting off whatever was being read. */
function speak(text: string, lang: Language, uri: string) {
  const s = synth();
  const voice = voicesFor(lang).find((v) => v.voiceURI === uri);
  if (!s || !voice) return;
  s.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  s.speak(utterance);
}

/** A speaker button that reads `text` in the course language; nothing without a voice. */
export function Listen({
  text,
  lang,
  small = false,
  className = '',
}: {
  text: string;
  lang: Language;
  small?: boolean;
  className?: string;
}) {
  const t = useTranslations('Lesson');
  const voice = useVoice(lang);
  if (voice === null) return null;
  return (
    <button
      type="button"
      data-listen
      aria-label={t('listen', { text })}
      onClick={() => speak(text, lang, voice)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-200 transition-colors hover:border-indigo-400 hover:text-white ${
        small ? 'size-8' : 'size-11'
      } ${className}`}
    >
      <svg viewBox="0 0 20 20" className={small ? 'size-3.5' : 'size-4'} aria-hidden="true">
        <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
        <path
          d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5a7 7 0 0 1 0 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
