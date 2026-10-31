import type { Brief, LessonContent } from '../../schemas/artifacts';

/**
 * The content file of a lesson whose kind has one (grammar, functions,
 * reading). The API stores it next to the brief; a missing one is a
 * broken lesson row, not something the player can work around.
 */
export function contentFile<C extends LessonContent>(brief: Brief, content: C | null): C {
  if (!content) throw new Error(`Lesson ${brief.id} has no content file`);
  return content;
}
