import type { ReadingBrief, ReadingContent, ReadingItem } from '../../schemas/reading';
import { PLAYER_COPY } from '../copy';
import { readingUnits } from '../readingPlan';
import { answers, type KindModule } from './kind';
import { contentFile } from './contentFile';

/**
 * Reading lessons in the player: the key words (flashcards, matching),
 * the main document (skim, detail, structure), then the exam on a second
 * document. The genre of the documents is never shown: guessing it is
 * part of the skim question.
 */

/** The steps of the key-words section; every other step before the exam reads the document. */
const KEYWORD_STEPS = new Set(['flashcards', 'matching']);

export const reading: KindModule<ReadingBrief, ReadingContent, ReadingItem> = {
  content: (brief, content) => contentFile(brief, content),
  units: readingUnits,
  arrange: (pages) => pages,

  traits: {
    reading_flashcards: { reveals: (item) => item.keywordIds, skipFeedbackWhenRight: false },
    reading_keyword_matching: answers(true),
    // A page with the document keeps its feedback, which points back into the text.
    reading_document: answers(false),
    reading_skim_choice: answers(true),
    reading_choice: answers(true),
    reading_true_false: answers(true),
    reading_order: answers(true),
  },

  section: (page) =>
    KEYWORD_STEPS.has(page.stepId)
      ? { key: 'keywords', title: PLAYER_COPY.keywords }
      : { key: 'document', title: PLAYER_COPY.document },
  pointTitle: (page) => page.stepLabel,
  // Nothing but the sections: the situation names the genre and answers the skim question.
  start: () => ({}),
  examPart: () => undefined,
};
