import { LessonSummarySchema, LessonTitleSchema } from '../schemas/lesson';
import { hasContentFile, type Brief, type LessonContent } from './schemas/artifacts';
import {
  grammarBriefLengthIssues,
  grammarContentLengthIssues,
  validateBrief,
  validateContent,
  type Issue,
  type OutlineContext,
} from './validation/artifacts';

/**
 * Validates one lesson, all its files together. The seed and the
 * authoring kit (#83) both call it, so they check the same rules.
 *
 *   content/briefs/<id>.json   ─┐
 *   content/lessons/<id>.json  ─┼─→ validateLesson ─→ ok, with the parsed files
 *   its outline entry          ─┘                    or every issue found
 *
 * On top of validateBrief and validateContent, it checks:
 * - the files: a content file for every kind but vocabulary, whose lesson
 *   is its brief alone;
 * - the grammar length rules (validation/grammarLength.ts), which the two
 *   validators leave out on purpose;
 * - what the database stores: the brief's title and its objective in the
 *   course language become the lesson's title and summary, so they must
 *   pass LessonTitleSchema and LessonSummarySchema (one line, 80 and 200
 *   characters), which the API checks every lesson card against. The
 *   content file repeats both, and must say the same.
 *
 * Each issue's path starts with its file: brief.targets.3.examForms,
 * content.steps.2. The brief comes first: without a valid brief there is
 * nothing to check the content against, so its issues are the only ones.
 */

export type LessonValidation =
  | {
      ok: true;
      /** The parsed files. Store these, not the raw JSON: the schemas trim the texts. */
      brief: Brief;
      /** Null for a vocabulary lesson. */
      content: LessonContent | null;
      /** For the lesson's title column: the brief's title. */
      title: string;
      /** For the lesson's summary column: the brief's objective in the course language. */
      summary: string;
    }
  | { ok: false; issues: Issue[] };

/** Puts the file in front of each path: targets.3 → brief.targets.3. */
const inFile = (file: 'brief' | 'content', issues: Issue[]): Issue[] =>
  issues.map((i) => ({ ...i, path: i.path ? `${file}.${i.path}` : file }));

/** The issues of a stored text: the schema's messages, at `path`. */
function columnIssues(schema: typeof LessonTitleSchema, value: string, path: string): Issue[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => ({ path, message: i.message }));
}

/**
 * `brief` and `content` are the two files, already parsed from JSON;
 * `content` is undefined when the lesson has no content file. `ctx` says
 * where the lesson belongs: its outline entry, the course language and level.
 */
export function validateLesson(
  brief: unknown,
  content: unknown,
  ctx: OutlineContext,
): LessonValidation {
  const briefResult = validateBrief(brief, ctx);
  const parsedBrief = briefResult.value;
  if (briefResult.status === 'invalid' || !parsedBrief)
    return { ok: false, issues: inFile('brief', briefResult.issues) };

  const { kind, title } = parsedBrief;
  const summary = parsedBrief.objective[ctx.lang];
  const briefIssues = [
    ...columnIssues(LessonTitleSchema, title, 'title'),
    ...columnIssues(LessonSummarySchema, summary, `objective.${ctx.lang}`),
    ...(parsedBrief.kind === 'grammar' ? grammarBriefLengthIssues(parsedBrief) : []),
  ];

  const contentIssues: Issue[] = [];
  let parsedContent: LessonContent | null = null;
  if (content === undefined) {
    if (hasContentFile(kind))
      contentIssues.push({
        path: '',
        message: `a ${kind} lesson needs its content file, content/lessons/${parsedBrief.id}.json`,
      });
  } else {
    // A vocabulary lesson has no content file: validateContent rejects one.
    const result = validateContent(content, { ...ctx, brief: parsedBrief });
    contentIssues.push(...result.issues);
    const value = result.value;
    if (result.status !== 'invalid' && value) {
      if (value.title !== title)
        contentIssues.push({ path: 'title', message: "must equal the brief's title" });
      const objective = value.objective as Record<string, string>;
      if (
        Object.entries(parsedBrief.objective).some(([locale, text]) => objective[locale] !== text)
      )
        contentIssues.push({ path: 'objective', message: "must equal the brief's objective" });
      if (value.kind === 'grammar') contentIssues.push(...grammarContentLengthIssues(value));
      parsedContent = value;
    }
  }

  const issues = [...inFile('brief', briefIssues), ...inFile('content', contentIssues)];
  if (issues.length) return { ok: false, issues };
  return { ok: true, brief: parsedBrief, content: parsedContent, title, summary };
}
