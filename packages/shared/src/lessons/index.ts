/**
 * The lesson files: their schemas (schemas/), the checks beyond the
 * schemas (validation/), and what is computed from them (domain/).
 *
 * Exported from @ft/shared as a namespace, `lessons`, never with
 * `export *`: the folder has generic names (Issue, Block, chunk) that
 * would clash with the rest of the package.
 *
 *   import { lessons } from '@ft/shared';
 *   const result = lessons.validateLesson(brief, content, { entry, lang, level });
 *
 * Only what the API needs is exported; add a name here when an app needs it.
 * The lesson player is its own namespace inside, `lessons.player`.
 */
export { validateLesson, type LessonValidation } from './validateLesson';
export type { Issue, OutlineContext } from './validation/artifacts';
export {
  briefSchema,
  contentSchema,
  hasContentFile,
  type Brief,
  type LessonContent,
} from './schemas/artifacts';
export * as player from './player';
