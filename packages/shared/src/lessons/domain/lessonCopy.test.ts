import { describe, expect, it } from 'vitest';

import { LEARNABLE_LANGUAGES } from '../../schemas/language';
import type { LocalizedText } from '../schemas/artifactCommon';
import { PLAYER_COPY } from '../player/copy';
import {
  COPY,
  dictationInstruction,
  EXERCISE_INSTRUCTIONS,
  examInstruction,
  FUNCTIONS_COPY,
  READING_COPY,
} from './lessonCopy';

/** Every LocalizedText in a nested object of copy. */
function texts(value: unknown): LocalizedText[] {
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') {
    if ('fr' in value && typeof value.fr === 'string') return [value as LocalizedText];
    return Object.values(value).flatMap(texts);
  }
  return [];
}

/**
 * The words that address the learner formally: vous, votre, vos, and the
 * verbs in -ez (choisissez, rappelez-vous). None of the fixed texts teaches
 * French, so none of them has a reason to use one.
 */
const formal = (fr: string) =>
  (fr.match(/\p{L}+/gu) ?? []).filter(
    (word) =>
      /^(vous|votre|vos)$/i.test(word) || (/ez$/i.test(word) && !/^(chez|assez)$/i.test(word)),
  );

describe('the fixed French copy', () => {
  const all = [
    ...texts([COPY, EXERCISE_INSTRUCTIONS, FUNCTIONS_COPY, READING_COPY, PLAYER_COPY]),
    ...LEARNABLE_LANGUAGES.flatMap((lang) => [examInstruction(lang), dictationInstruction(lang)]),
  ];

  it('covers every text', () => {
    expect(all.length).toBeGreaterThan(60);
  });

  // The interface says tu since #106 (apps/web/messages/fr.json); the player and the lessons match it.
  it.each(all.map((text) => [text.fr]))('addresses the learner with tu: %s', (fr) => {
    expect(formal(fr)).toEqual([]);
  });

  it('keeps the examples of #207', () => {
    expect(PLAYER_COPY.examIntro.fr).toBe('Ton examen final');
    expect(COPY.flashcards[1].fr).toBe(
      'Rappelle-toi chaque mot, puis retourne la carte pour vérifier.',
    );
    expect(examInstruction('de').fr).toBe(
      'Traduis chaque mot en allemand, avec l’article pour les noms.',
    );
  });
});
