import { COPY } from '../domain/lessonCopy';
import type { LocalizedText } from '../schemas/artifactCommon';

/**
 * The fixed texts the player adds to every lesson, in en, fr and de, like
 * ../domain/lessonCopy.ts does for the lesson files: the discussion page,
 * and the names of the outline sections that have no label in the lesson.
 */

const L = (en: string, fr: string, de: string): LocalizedText => ({ en, fr, de });

export const PLAYER_COPY = {
  /** The unscored page before the exam info page, in every kind: [step label, instruction]. */
  discussion: [
    L('Discussion', 'Discussion', 'Gespräch'),
    L(
      'Talk about what you have just learned before the exam.',
      'Parlez de ce que vous venez d’apprendre avant l’examen.',
      'Sprich vor der Prüfung über das, was du gerade gelernt hast.',
    ),
  ],
  /** The label of the exam step in every lesson, whatever its file says: Final exam. */
  exam: COPY.exam[0],
  /** The heading of the exam info page, as the prototype's. */
  examIntro: L('Your final exam', 'Votre examen final', 'Deine Abschlussprüfung'),
  /** Outline sections. */
  exercises: L('Exercises', 'Exercices', 'Übungen'),
  keywords: L('Key words', 'Mots clés', 'Schlüsselwörter'),
  document: L('The document', 'Le document', 'Das Dokument'),
  /** The parts of a split exam in the results (kinds/functions.ts). */
  parts: {
    translation: L('Translation', 'Traduction', 'Übersetzung'),
    replies: L('Replies', 'Réponses', 'Antworten'),
    dialogue: L('Dialogue', 'Dialogue', 'Dialog'),
  },
} as const;

/**
 * The duration of the discussion page, in seconds, when the lesson does
 * not plan one (grammar plans it as its feedbackPlaceholder).
 */
export const DISCUSSION_SECONDS = 60;

/** The duration of the exam info page, in seconds. */
export const EXAM_INTRO_SECONDS = 20;
