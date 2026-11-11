'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

/*
 * Speech through the browser's speechSynthesis (#147). Nothing in a lesson
 * needs a voice: without one for the course language, the Listen buttons
 * are not rendered and the lesson plays on.
 */

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

function subscribe(onChange: () => void) {
  const s = synth();
  if (!s) return () => {};
  // Chromium fills the list late, and tells with voiceschanged.
  s.addEventListener('voiceschanged', onChange);
  return () => s.removeEventListener('voiceschanged', onChange);
}

/** The first voice of the language, or null: none on the server, and none on many headless browsers. */
function voiceFor(lang: Language): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? [];
  return voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === lang) ?? null;
}

/** Speaks a text of the course language; null while there is no voice for it. */
export function useSpeech(lang: Language): ((text: string) => void) | null {
  // A string snapshot: getVoices may hand out new objects on every call.
  const uri = useSyncExternalStore(
    subscribe,
    () => voiceFor(lang)?.voiceURI ?? null,
    () => null,
  );
  const speak = useCallback(
    (text: string) => {
      const s = synth();
      const voice = s?.getVoices().find((v) => v.voiceURI === uri);
      if (!s || !voice) return;
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      s.speak(utterance);
    },
    [uri],
  );
  return uri ? speak : null;
}

/** The speaker button of the mockups: reads `text` aloud. Rendered only when a voice exists. */
export function ListenButton({
  text,
  lang,
  size = 'md',
}: {
  text: string;
  lang: Language;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('Lesson');
  const speak = useSpeech(lang);
  if (!speak) return null;
  return (
    <button
      type="button"
      aria-label={t('listenTo', { text })}
      onClick={(event) => {
        // A speaker inside a clickable card speaks, and does nothing else.
        event.stopPropagation();
        speak(text);
      }}
      className={`lesson-listen ${size === 'sm' ? 'is-small' : ''}`}
      data-listen
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 8v4h3l4 3.5v-11L6 8H3z" />
        <path
          d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6.5 6.5 0 0 1 0 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
