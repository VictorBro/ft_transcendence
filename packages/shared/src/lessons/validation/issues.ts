/**
 * How the validators report what is wrong with a lesson file.
 *
 * A validator does not stop at the first problem: it collects every one,
 * so the author can fix the whole file in one pass. Each problem is an
 * Issue: where it is in the file (a path to the field) and what is wrong.
 *
 *   { path: 'targets.3.examForms', message: '"livre" must include the indefinite article…' }
 *
 * The path joins the keys and array indexes with dots: targets.3.examForms
 * is the examForms of the fourth target. A path may also name a step by
 * its stage (steps.flashcards) when that is easier to find.
 */

export interface Issue {
  path: string;
  message: string;
}

/**
 * The list of issues a validator fills as it goes. Every check of a
 * validator is one call:
 *
 *   issues.check(rules.has(r), 'blocks.0.ruleIds', `unknown rule ${r}`);
 *   issues.unique(targetIds, 'targets', 'target ID');
 */
export class Issues {
  list: Issue[] = [];

  add(path: string, message: string) {
    this.list.push({ path, message });
  }

  /**
   * Adds an issue when `ok` is false. Returns `ok`, so a check can guard
   * the checks that only make sense when it passes:
   *
   *   if (issues.check(answer !== undefined, path, 'answerOptionId must be one of the options') && answer)
   *     // here the answer exists
   */
  check(ok: boolean, path: string, message: string) {
    if (!ok) this.add(path, message);
    return ok;
  }

  /** Adds one issue for each value seen a second time: "duplicate target ID t2". */
  unique(values: string[], path: string, what: string) {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) this.add(path, `duplicate ${what} ${v}`);
      seen.add(v);
    }
  }
}
