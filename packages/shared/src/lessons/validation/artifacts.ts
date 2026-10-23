import type { z } from 'zod';

import { nativeLocales } from '../schemas/artifactCommon';
import {
  briefSchema,
  contentSchema,
  hasContentFile,
  isSupportedKind,
  type Brief,
  type LessonContent,
} from '../schemas/artifacts';
import {
  GRAMMAR_LENGTH,
  PERSON_MATCHING_EXEMPT,
  PERSON_MATCHING_TOPICS,
  PERSONS,
  PRONOUN_FORM_TOPICS,
  PRONOUN_FORM_TYPES,
  type GrammarBrief,
  type GrammarContent,
  type GrammarItem,
} from '../schemas/grammar';
import type { LessonOutlineEntry } from '../../schemas/lesson';
import { learningForms, parseRichText, richTextShape } from '../domain/richText';
import type { VocabularyBrief, VocabularyTarget } from '../schemas/vocabulary';
import { chunk, matchingPages, vocabularyLesson } from '../domain/vocabularyLesson';
import { functionsPageEstimate, functionsTimeLimit } from '../domain/functionsLesson';
import {
  FUNCTIONS_LIMITS,
  FUNCTIONS_PAGE_RULES,
  FUNCTIONS_STAGES,
  type FunctionsBrief,
  type FunctionsContent,
  type FunctionsItem,
} from '../schemas/functions';
import { checkReadingBrief, checkReadingContent } from './reading';

/**
 * Cross-reference and pedagogical checks that JSON Schema cannot express
 * (SPEC section 4). Schema validity is necessary but does not prove correct
 * teaching content; human review covers language quality.
 */

export interface Issue {
  path: string;
  message: string;
}

export type ArtifactStatus = 'valid' | 'invalid' | 'stale';

export interface ValidationResult<T> {
  status: ArtifactStatus;
  value?: T;
  issues: Issue[];
  /** Input-hash mismatches: the artifact is valid but was generated from older inputs. */
  staleReasons: string[];
}

export interface OutlineContext {
  entry: LessonOutlineEntry;
  lang: string;
  level: string;
  /** Current per-entry outline hash; omitted to skip staleness checks. */
  outlineHash?: string;
}

export class Issues {
  list: Issue[] = [];
  add(path: string, message: string) {
    this.list.push({ path, message });
  }
  check(ok: boolean, path: string, message: string) {
    if (!ok) this.add(path, message);
    return ok;
  }
  unique(values: string[], path: string, what: string) {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) this.add(path, `duplicate ${what} ${v}`);
      seen.add(v);
    }
  }
}

function schemaIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Same members with the same multiplicity, in any order. */
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/** Corrections must name the mark, not only the character (D28). */
const CHARACTER_ONLY = /\bwritten with (an? )?[àâäçéèêëîïôöûùüÿœæ](?![\p{L}])/iu;

function checkEnvelope(v: Brief | LessonContent, ctx: OutlineContext, issues: Issues) {
  issues.check(v.id === ctx.entry.id, 'id', `must equal the outline ID ${ctx.entry.id}`);
  issues.check(v.kind === ctx.entry.kind, 'kind', `must equal the outline kind ${ctx.entry.kind}`);
  issues.check(v.lang === ctx.lang, 'lang', `must equal the course language ${ctx.lang}`);
  issues.check(v.level === ctx.level, 'level', `must equal the course level ${ctx.level}`);
  if (v.kind === 'grammar')
    issues.check(
      v.topic === ctx.entry.topic,
      'topic',
      `must equal the outline topic ${ctx.entry.topic}`,
    );
  else
    issues.check(
      v.theme === ctx.entry.theme,
      'theme',
      `must equal the outline theme ${ctx.entry.theme}`,
    );
}

function checkMinutes(estimatedMinutes: number, seconds: number, issues: Issues) {
  const expected = Math.max(1, Math.round(seconds / 60));
  issues.check(
    estimatedMinutes === expected,
    'estimatedMinutes',
    `must equal the summed page estimates rounded to minutes (${expected})`,
  );
}

/* ================================================================= briefs */

const FR_INDEFINITE = /^(un|une|des) \S/u;

/**
 * French noun article policy (D39): the indefinite article agrees with number and the accepted
 * genders (un/une singular, des plural). Returns a message when `form` breaks it.
 */
function frArticleIssue(t: VocabularyTarget, form: string): string | undefined {
  const article = /^(un|une|des) /u.exec(form)?.[1];
  if (!article)
    return `"${form}" must include the indefinite article un/une/des (D39) or the target must declare an articleException`;
  const allowed =
    t.number === 'plural' ? ['des'] : t.genders.map((g) => (g === 'feminine' ? 'une' : 'un'));
  if (!allowed.includes(article))
    return `"${form}" uses "${article}" but a ${t.number} ${t.genders.join('/')} noun takes ${allowed.join(' or ')}`;
  return undefined;
}

function checkVocabularyBrief(b: VocabularyBrief, ctx: OutlineContext, issues: Issues) {
  const ids = b.targets.map((t) => t.id);
  const known = new Set(ids);
  issues.unique(ids, 'targets', 'target ID');
  issues.check(
    b.targets.length === b.targetCount,
    'targetCount',
    `is ${b.targetCount} but ${b.targets.length} targets are listed`,
  );
  issues.unique(
    b.groups.map((g) => g.id),
    'groups',
    'group ID',
  );
  const grouped = b.groups.flatMap((g) => g.targetIds);
  issues.check(
    sameSet(grouped, ids) && grouped.length === ids.length,
    'groups',
    'every target must belong to exactly one group',
  );

  b.targets.forEach((t, i) => {
    const p = `targets.${i}`;
    if (t.wordClass === 'noun') {
      issues.check(
        t.genders.length > 0,
        `${p}.genders`,
        'a noun needs at least one accepted gender',
      );
      issues.check(t.number !== null, `${p}.number`, 'a noun needs a grammatical number');
      // Nouns are examined only as indefinite article + noun (translation and dictation, D39).
      if (ctx.lang === 'fr' && t.articleException === null) {
        for (const f of t.examForms) {
          const m = frArticleIssue(t, f);
          issues.check(!m, `${p}.examForms`, m ?? '');
        }
        const m = frArticleIssue(t, t.teachingForm);
        issues.check(!m, `${p}.teachingForm`, m ?? '');
        for (const v of t.genderVariants)
          issues.check(
            FR_INDEFINITE.test(v),
            `${p}.genderVariants`,
            `"${v}" must include the indefinite article un/une/des (D39)`,
          );
      }
      if (ctx.lang === 'fr' && t.articleException !== null) {
        issues.check(
          !t.examForms.some((f) => FR_INDEFINITE.test(f)),
          `${p}.articleException`,
          'remove the articleException: the exam forms use an indefinite article',
        );
      }
    } else {
      issues.check(t.genders.length === 0, `${p}.genders`, 'only nouns have a gender (D8)');
      issues.check(t.number === null, `${p}.number`, 'only nouns have a grammatical number here');
      issues.check(
        t.articleException === null,
        `${p}.articleException`,
        'only nouns can have an article exception',
      );
    }
    // The gender exercise shows the bare term, so it must not reveal the gender through an article.
    if (ctx.lang === 'fr' && t.wordClass === 'noun')
      issues.check(
        !/^(le|la|les|un|une|des) |^l'/iu.test(t.term),
        `${p}.term`,
        `"${t.term}" must be the base term without article`,
      );
    // The displayed teaching form is examined as shown: one exam form, or an adjective's gender pair (espagnol, espagnole).
    issues.check(
      t.examForms.includes(t.teachingForm) || t.teachingForm === t.examForms.join(', '),
      `${p}.teachingForm`,
      `"${t.teachingForm}" must be one of the exam forms (D39)`,
    );
  });

  // Exercise texts (P2-04): every word takes part in every exercise; the lesson is derived from the brief.
  const ref = (id: string, path: string) =>
    issues.check(known.has(id), path, `unknown target ${id}`);
  b.targets.forEach((t, i) => {
    const p = `targets.${i}`;
    issues.check(
      (t.genderExplanation !== null) === (t.wordClass === 'noun'),
      `${p}.genderExplanation`,
      t.wordClass === 'noun' ? 'required for a noun' : 'only nouns have a gender explanation',
    );
    const refs = t.gap.referenceTargetIds;
    issues.check(
      new Set(refs).size === 4 && refs.includes(t.id),
      `${p}.gap.referenceTargetIds`,
      'four distinct reference targets including the word',
    );
    refs.forEach((id) => ref(id, `${p}.gap.referenceTargetIds`));
    if (ctx.lang === 'fr')
      for (const a of t.gap.accepted.answers)
        issues.check(
          (a === 'un' && t.wordClass === 'numeral') || !FR_ARTICLE_START.test(a),
          `${p}.gap.accepted`,
          `typed-gap answer "${a}" must be article-free`,
        );
    const others = refs
      .filter((id) => id !== t.id)
      .map((id) => b.targets.find((x) => x.id === id)?.term.toLowerCase());
    issues.check(
      !t.gap.accepted.answers.some((a) => others.includes(a.toLowerCase())),
      `${p}.gap`,
      'exactly one reference choice may fit the gap',
    );
    const options = t.listeningOptionTargetIds;
    issues.check(
      new Set(options).size === 4 && options.includes(t.id),
      `${p}.listeningOptionTargetIds`,
      'four distinct options including the word',
    );
    options.forEach((id) => ref(id, `${p}.listeningOptionTargetIds`));
    for (const [what, text] of [
      ['explanation', t.explanation],
      ['gap.explanation', t.gap.explanation],
      ['genderExplanation', t.genderExplanation],
    ] as const) {
      if (text && CHARACTER_ONLY.test(text.en))
        issues.add(
          `${p}.${what}`,
          `explanation "${text.en}" must name the mark (accent aigu, cédille, umlaut…), not only the character`,
        );
    }
    // Translation prompts must say which gender/number is meant, or every variant is accepted.
    if (t.genderVariants.length && t.examPrompt) {
      issues.check(
        nativeLocales(ctx.lang).every((l) => t.examPrompt![l] !== t.translations[l]?.[0]),
        `${p}.examPrompt`,
        'must disambiguate gender/number in every mother tongue, or be null so every gender variant is accepted',
      );
    }
  });
  b.groups.forEach((g, i) => checkRichText(g.introduction, `groups.${i}.introduction`, issues));
  // Matching labels must be distinct within each derived matching page.
  matchingPages(b).forEach((ids, n) => {
    const page = ids.map((id) => b.targets.find((t) => t.id === id)).filter((t) => t !== undefined);
    for (const locale of nativeLocales(ctx.lang)) {
      issues.unique(
        page.map((t) => t.matchingLabel?.[locale] ?? t.translations[locale]?.[0] ?? ''),
        `matching.${n + 1}`,
        `${locale} matching label (set matchingLabel)`,
      );
    }
  });
  if (!issues.list.length)
    checkMinutes(
      b.estimatedMinutes,
      vocabularyLesson(b)
        .steps.flatMap((s) => s.pages)
        .reduce((n, pg) => n + pg.estimatedDurationS, 0),
      issues,
    );
}

/** Pronoun/form exercises only for topics with person-marked forms (P3-01). */
function checkPronounFormTopic(b: GrammarBrief, type: string, path: string, issues: Issues) {
  if (!PRONOUN_FORM_TYPES.includes(type as never)) return;
  issues.check(
    (PRONOUN_FORM_TOPICS as readonly string[]).includes(b.topic),
    path,
    `${type} suits only ${PRONOUN_FORM_TOPICS.join(', ')} topics, not ${b.topic}; use gaps or word order`,
  );
}

function checkGrammarBrief(b: GrammarBrief, issues: Issues) {
  const rules = new Set(b.rules.map((r) => r.id));
  issues.unique(
    b.rules.map((r) => r.id),
    'rules',
    'rule ID',
  );
  issues.unique(
    b.blocks.map((x) => x.id),
    'blocks',
    'block ID',
  );
  issues.unique(
    b.blocks.flatMap((x) => x.exercises.map((e) => e.id)),
    'blocks',
    'exercise ID',
  );
  issues.unique(
    b.exam.pages.map((pg) => pg.pageId),
    'exam.pages',
    'page ID',
  );
  const taught = new Set<string>();
  b.blocks.forEach((block, i) => {
    for (const r of block.ruleIds) {
      issues.check(rules.has(r), `blocks.${i}.ruleIds`, `unknown rule ${r}`);
      taught.add(r);
    }
    block.exercises.forEach((ex, j) => {
      // A person matching board may also review the persons of earlier blocks (singular, then plural).
      const allowed = (r: string) =>
        block.ruleIds.includes(r) || (ex.type === 'grammar_person_matching' && taught.has(r));
      for (const r of ex.ruleIds)
        issues.check(
          allowed(r),
          `blocks.${i}.exercises.${j}.ruleIds`,
          `rule ${r} is not taught in this block${ex.type === 'grammar_person_matching' ? ' or an earlier one' : ''}`,
        );
      checkPronounFormTopic(b, ex.type, `blocks.${i}.exercises.${j}.type`, issues);
    });
  });
  for (const r of rules) issues.check(taught.has(r), 'blocks', `rule ${r} is never taught`);
  if (
    (PERSON_MATCHING_TOPICS as readonly string[]).includes(b.topic) &&
    !(PERSON_MATCHING_EXEMPT as readonly string[]).includes(b.id)
  ) {
    issues.check(
      b.blocks.some((x) => x.exercises.some((e) => e.type === 'grammar_person_matching')),
      'blocks',
      `${b.topic} lessons include a grammar_person_matching exercise`,
    );
  }
  issues.unique(
    b.newVerbs.map((v) => v.infinitive),
    'newVerbs',
    'infinitive',
  );
  const examined = new Set(b.exam.pages.flatMap((pg) => pg.ruleIds));
  b.exam.pages.forEach((pg, i) => {
    for (const r of pg.ruleIds)
      issues.check(rules.has(r), `exam.pages.${i}.ruleIds`, `unknown rule ${r}`);
    checkPronounFormTopic(b, pg.type, `exam.pages.${i}.type`, issues);
  });
  for (const r of rules)
    issues.check(examined.has(r), 'exam.pages', `the exam does not cover rule ${r}`);
  checkMinutes(
    b.estimatedMinutes,
    sum(
      b.blocks.map(
        (x) => x.explanationDurationS + sum(x.exercises.map((e) => e.estimatedDurationS)),
      ),
    ) +
      b.feedbackPlaceholder.estimatedDurationS +
      sum(b.exam.pages.map((pg) => pg.estimatedDurationS)),
    issues,
  );
}

function finish<T>(value: T, issues: Issues, stale: string[]): ValidationResult<T> {
  if (issues.list.length)
    return { status: 'invalid', value, issues: issues.list, staleReasons: stale };
  return { status: stale.length ? 'stale' : 'valid', value, issues: [], staleReasons: stale };
}

export function validateBrief(data: unknown, ctx: OutlineContext): ValidationResult<Brief> {
  if (!isSupportedKind(ctx.entry.kind)) {
    return {
      status: 'invalid',
      issues: [
        { path: 'kind', message: `${ctx.entry.kind} lessons have no agreed brief schema yet` },
      ],
      staleReasons: [],
    };
  }
  const parsed = briefSchema(ctx.entry.kind, ctx.lang).safeParse(data);
  if (!parsed.success)
    return { status: 'invalid', issues: schemaIssues(parsed.error), staleReasons: [] };
  const brief = parsed.data;
  const issues = new Issues();
  checkEnvelope(brief, ctx, issues);
  if (brief.kind === 'vocabulary') checkVocabularyBrief(brief, ctx, issues);
  else if (brief.kind === 'grammar') checkGrammarBrief(brief, issues);
  else if (brief.kind === 'reading') checkReadingBrief(brief, issues);
  else checkFunctionsBrief(brief, ctx, issues);
  const stale =
    ctx.outlineHash && brief.provenance.inputHashes.outline !== ctx.outlineHash
      ? ['the outline entry changed after this brief was generated']
      : [];
  return finish(brief, issues, stale);
}

/* ================================================================ content */

export interface ContentContext extends OutlineContext {
  brief: Brief;
  /** Current canonical hash of the brief file; omitted to skip staleness checks. */
  briefHash?: string;
}

function checkExplanations(
  items: { answerExplanation?: { en: string } }[],
  path: string,
  issues: Issues,
) {
  for (const it of items) {
    if (it.answerExplanation && CHARACTER_ONLY.test(it.answerExplanation.en)) {
      issues.add(
        path,
        `explanation "${it.answerExplanation.en}" must name the mark (accent aigu, cédille, umlaut…), not only the character`,
      );
    }
  }
}

/** Restricted Markdown teaching text (D46): allowed syntax, same structure and learning-language forms in every locale. */
function checkRichText(text: Record<string, string>, path: string, issues: Issues) {
  const parsed = Object.entries(text).map(([locale, value]) => ({
    locale,
    ...parseRichText(value),
  }));
  for (const p of parsed)
    for (const e of p.errors) issues.add(`${path}.${p.locale}`, `${e} (restricted Markdown, D46)`);
  const [first, ...rest] = parsed;
  for (const p of rest) {
    issues.check(
      richTextShape(p.blocks) === richTextShape(first.blocks),
      `${path}.${p.locale}`,
      `block structure ${richTextShape(p.blocks)} differs from ${first.locale} (${richTextShape(first.blocks)})`,
    );
    const forms = learningForms(p.blocks),
      firstForms = learningForms(first.blocks);
    issues.check(
      sameSet(forms, firstForms),
      `${path}.${p.locale}`,
      `learning-language forms differ from ${first.locale}: ${forms.map((f) => `\`${f}\``).join(', ') || 'none'} vs ${firstForms.map((f) => `\`${f}\``).join(', ') || 'none'}`,
    );
  }
}

const FR_ARTICLE_START = /^(un|une|des|le|la|les|l')(\s|$)|^l'/iu;

function checkGrammarItem(
  item: GrammarItem,
  path: string,
  rules: Set<string>,
  exam: boolean,
  issues: Issues,
) {
  if ('ruleIds' in item)
    for (const r of item.ruleIds)
      issues.check(rules.has(r), `${path}.ruleIds`, `unknown rule ${r}`);
  const tokens = 'tokens' in item ? item.tokens : [];
  issues.unique(
    tokens.map((t) => t.tokenId),
    path,
    'token ID',
  );
  switch (item.type) {
    case 'grammar_explanation':
      checkRichText(item.text, `${path}.text`, issues);
      break;
    case 'grammar_gap_choice':
      issues.unique(
        item.choices.map((ch) => ch.choiceId),
        path,
        'choice ID',
      );
      issues.unique(
        item.choices.map((ch) => ch.text),
        path,
        'choice text',
      );
      issues.check(
        item.choices.some((ch) => ch.choiceId === item.answerChoiceId),
        path,
        'answerChoiceId must be one of the choices',
      );
      issues.check(
        !/\(.*\)/.test(`${item.before} ${item.after}`),
        path,
        'put cues into hint (shown above the sentence), not in parentheses inside the sentence',
      );
      break;
    case 'grammar_gap_typing':
      if (exam) issues.check(item.hint === null, path, 'exam gaps have no hint');
      break;
    case 'grammar_pronoun_form_match':
      issues.unique(
        item.rows.map((r) => r.rowId),
        path,
        'row ID',
      );
      for (const r of item.rows)
        issues.check(
          tokens.some((t) => r.validForms.includes(t.text)),
          path,
          `row ${r.rowId} has no token with a valid form`,
        );
      checkExplanations(item.rows, path, issues);
      break;
    case 'grammar_person_matching': {
      // Rows follow the persons: the singular block, the plural block, or both (P3-02 review).
      const persons = item.rows.map((r) => r.person).join(',');
      const blocks = [PERSONS.slice(0, 3), PERSONS.slice(3), PERSONS].map((b) => b.join(','));
      issues.check(
        blocks.includes(persons),
        `${path}.rows`,
        `persons must be ${blocks.map((b) => `[${b}]`).join(' or ')} in this order, not [${persons}]`,
      );
      const translation = item.mode === 'translation';
      item.rows.forEach((r, n) =>
        issues.check(
          translation
            ? r.native !== null && r.pronoun === null
            : r.pronoun !== null && r.native === null,
          `${path}.rows.${n}`,
          translation
            ? 'translation rows have a native prompt and no pronoun'
            : 'forms rows have a pronoun and no native prompt',
        ),
      );
      if (translation) {
        const locales = [...new Set(item.rows.flatMap((r) => Object.keys(r.native ?? {})))];
        for (const locale of locales)
          issues.unique(
            item.rows.map((r) => (r.native as Record<string, string> | null)?.[locale] ?? ''),
            path,
            `${locale} prompt`,
          );
      } else
        issues.unique(
          item.rows.map((r) => r.pronoun ?? ''),
          path,
          'pronoun',
        );
      checkExplanations(item.rows, path, issues);
      break;
    }
    case 'grammar_pronoun_form_typing':
      issues.unique(
        item.rows.map((r) => r.rowId),
        path,
        'row ID',
      );
      checkExplanations(item.rows, path, issues);
      break;
    case 'grammar_word_order': {
      const all = tokens.map((t) => t.tokenId);
      for (const order of item.acceptedOrders)
        issues.check(
          order.length === all.length && sameSet(order, all),
          path,
          'each accepted order uses every token exactly once',
        );
      break;
    }
    case 'grammar_error_spotter': {
      const faulty = tokens.find((t) => t.tokenId === item.faultyTokenId);
      if (
        issues.check(faulty !== undefined, path, 'faultyTokenId must be one of the tokens') &&
        faulty
      ) {
        issues.check(
          !item.correction.accepted.answers.includes(faulty.text),
          path,
          'the correction must differ from the faulty token',
        );
      }
      if (item.correction.mode === 'select') {
        issues.check(
          item.correction.choices.length >= 2 &&
            item.correction.choices.some((ch) => item.correction.accepted.answers.includes(ch)),
          path,
          'select mode needs 2–4 choices including an accepted answer',
        );
      } else {
        issues.check(item.correction.choices.length === 0, path, 'type mode has no choices');
      }
      break;
    }
  }
  if ('answerExplanation' in item) checkExplanations([item], path, issues);
}

/** Scored units of a grammar item: one per row for row items, else one. */
const unitCount = (item: GrammarItem) =>
  'rows' in item
    ? item.rows.length
    : item.type === 'grammar_explanation' || item.type === 'production_feedback_placeholder'
      ? 0
      : 1;

/**
 * Lesson length rules (P3-07, SPEC section 7). They are a quality gate for authored and generated
 * lessons, not a condition for playing a lesson: the generator applies the brief rules before saving,
 * and `make sample-lessons` and the authoring tool apply both to every grammar lesson in content/.
 */
export function grammarBriefLengthIssues(b: GrammarBrief): Issue[] {
  const L = GRAMMAR_LENGTH;
  const issues = new Issues();
  b.blocks.forEach((block, i) =>
    issues.check(
      block.exercises.length >= L.exercisesPerBlock[0],
      `blocks.${i}.exercises`,
      `a teaching block has ${L.exercisesPerBlock[0]}–${L.exercisesPerBlock[1]} exercises (P3-07)`,
    ),
  );
  issues.check(
    b.exam.pages.length >= L.examPages[0] && b.exam.pages.length <= L.examPages[1],
    'exam.pages',
    `the exam has ${L.examPages[0]}–${L.examPages[1]} pages (P3-07)`,
  );
  // Row items (pronoun rows, person boards) count at least three units each.
  const planned = (type: string, n: number) => (/pronoun|person/.test(type) ? 3 * n : n);
  const practice = b.blocks
    .flatMap((x) => x.exercises)
    .reduce((n, e) => n + planned(e.type, e.itemCount), 0);
  const exam = b.exam.pages.reduce((n, p) => n + planned(p.type, p.itemCount), 0);
  issues.check(
    practice >= L.minPracticeUnits,
    'blocks',
    `the exercises plan about ${practice} scored units; at least ${L.minPracticeUnits} (P3-07)`,
  );
  issues.check(
    exam >= L.minExamUnits,
    'exam.pages',
    `the exam plans about ${exam} scored units; at least ${L.minExamUnits} (P3-07)`,
  );
  return issues.list;
}

export function grammarContentLengthIssues(c: GrammarContent): Issue[] {
  const L = GRAMMAR_LENGTH;
  const issues = new Issues();
  const units = (role: 'exam' | 'practice') =>
    c.steps
      .filter((s) => (role === 'exam' ? s.role === 'exam' : s.role === 'exercise'))
      .flatMap((s) => s.pages.flatMap((pg) => pg.items))
      .reduce((n, it) => n + unitCount(it), 0);
  issues.check(
    units('practice') >= L.minPracticeUnits,
    'steps',
    `practice has ${units('practice')} scored units; at least ${L.minPracticeUnits} (P3-07)`,
  );
  issues.check(
    units('exam') >= L.minExamUnits,
    'steps',
    `the exam has ${units('exam')} scored units; at least ${L.minExamUnits} (P3-07)`,
  );
  c.steps.forEach((step, si) =>
    step.pages.forEach((pg, pi) => {
      const n = pg.items.reduce((sum, it) => sum + unitCount(it), 0);
      const path = `steps.${si}.pages.${pi}.estimatedDurationS`;
      if (step.role === 'explanation') {
        issues.check(
          pg.estimatedDurationS >= L.explanationSeconds[0] &&
            pg.estimatedDurationS <= L.explanationSeconds[1],
          path,
          `an explanation page takes ${L.explanationSeconds[0]}–${L.explanationSeconds[1]} s`,
        );
      } else if (n > 0) {
        const per = pg.estimatedDurationS / n;
        issues.check(
          per >= L.secondsPerUnit[0] && per <= L.secondsPerUnit[1],
          path,
          `${Math.round(per)} s per scored unit; keep ${L.secondsPerUnit[0]}–${L.secondsPerUnit[1]} s (P3-07)`,
        );
      }
    }),
  );
  return issues.list;
}

/** Items assess only the planned rules, and together they assess every planned rule (P3-01). */
function checkRuleCoverage(
  items: GrammarItem[],
  planned: string[],
  path: string,
  label: string,
  issues: Issues,
) {
  const assessed = new Set(items.flatMap((it) => ('ruleIds' in it ? it.ruleIds : [])));
  for (const r of assessed)
    issues.check(planned.includes(r), path, `rule ${r} is not planned for ${label}`);
  for (const r of planned)
    issues.check(assessed.has(r), path, `no item of ${label} assesses rule ${r}`);
}

function checkGrammarContent(c: GrammarContent, b: GrammarBrief, issues: Issues) {
  const rules = new Set(b.rules.map((r) => r.id));
  // Expected sequence: per block one explanation step, then one step per planned exercise; feedback; exam.
  const expected: {
    role: string;
    blockId: string | null;
    exercise?: GrammarBrief['blocks'][number]['exercises'][number];
  }[] = [];
  for (const block of b.blocks) {
    expected.push({ role: 'explanation', blockId: block.id });
    for (const ex of block.exercises)
      expected.push({ role: 'exercise', blockId: block.id, exercise: ex });
  }
  expected.push({ role: 'feedback', blockId: null }, { role: 'exam', blockId: null });
  if (
    !issues.check(
      c.steps.length === expected.length,
      'steps',
      `expected ${expected.length} steps from the brief's blocks, exercises, feedback and exam`,
    )
  )
    return;
  const examPlan = new Map(b.exam.pages.map((pg) => [pg.pageId, pg]));

  c.steps.forEach((step, si) => {
    const want = expected[si];
    const sp = `steps.${si}`;
    issues.check(
      step.role === want.role && step.blockId === want.blockId,
      sp,
      `expected a ${want.role} step${want.blockId ? ` for block ${want.blockId}` : ''}`,
    );
    const items = step.pages.flatMap((pg) => pg.items);
    if (want.role === 'explanation')
      issues.check(
        items.every((it) => it.type === 'grammar_explanation'),
        sp,
        'explanation steps contain explanations only',
      );
    if (want.role === 'feedback')
      issues.check(
        items.length === 1 && items[0].type === 'production_feedback_placeholder',
        sp,
        'the feedback step is the fixed production placeholder',
      );
    if (want.exercise) {
      issues.check(
        items.every((it) => it.type === want.exercise!.type),
        sp,
        `planned exercise ${want.exercise.id} is ${want.exercise.type}`,
      );
      if (want.exercise.type === 'grammar_person_matching')
        issues.check(
          step.pages.every((pg) => pg.items.length === 1),
          sp,
          'each person matching board has a page of its own',
        );
      issues.check(
        items.length === want.exercise.itemCount,
        sp,
        `planned exercise ${want.exercise.id} has ${want.exercise.itemCount} items`,
      );
      checkRuleCoverage(
        items,
        want.exercise.ruleIds,
        sp,
        `planned exercise ${want.exercise.id}`,
        issues,
      );
    }
    if (want.role === 'explanation') {
      const block = b.blocks.find((x) => x.id === want.blockId)!;
      for (const it of items)
        if ('ruleIds' in it)
          for (const r of it.ruleIds)
            issues.check(
              block.ruleIds.includes(r),
              sp,
              `rule ${r} is not taught in block ${block.id}`,
            );
    }
    step.pages.forEach((page, pi) => {
      const pp = `${sp}.pages.${pi}`;
      if (want.role === 'exam') {
        const plan = examPlan.get(page.pageId);
        if (
          issues.check(
            plan !== undefined,
            `${pp}.pageId`,
            `exam page ${page.pageId} is not in the brief's exam plan`,
          ) &&
          plan
        ) {
          issues.check(
            page.timeLimitS === plan.timeLimitS,
            `${pp}.timeLimitS`,
            `must equal the brief's limit ${plan.timeLimitS}s`,
          );
          issues.check(
            page.items.every((it) => it.type === plan.type) && page.items.length === plan.itemCount,
            `${pp}.items`,
            `page plan expects ${plan.itemCount} ${plan.type} items`,
          );
          checkRuleCoverage(
            page.items,
            plan.ruleIds,
            `${pp}.items`,
            `exam page ${plan.pageId}`,
            issues,
          );
        }
      } else {
        issues.check(
          page.timeLimitS === null,
          `${pp}.timeLimitS`,
          'only exam pages have a countdown',
        );
      }
      page.items.forEach((item, ii) =>
        checkGrammarItem(item, `${pp}.items.${ii}`, rules, want.role === 'exam', issues),
      );
    });
  });
  const examPages = c.steps[c.steps.length - 1].pages.map((pg) => pg.pageId);
  issues.check(
    sameSet(examPages, [...examPlan.keys()]),
    'steps',
    'exam pages must match the brief exam plan',
  );
  // The exam uses fresh examples (P3-05): no exam sentence repeats an explanation example or a practice sentence.
  const taught = new Set(
    c.steps
      .slice(0, -1)
      .flatMap((step) => step.pages.flatMap((pg) => pg.items.flatMap(grammarSentences))),
  );
  c.steps[c.steps.length - 1].pages.forEach((page, pi) =>
    page.items.forEach((item, ii) => {
      for (const sentence of grammarSentences(item))
        issues.check(
          !taught.has(sentence),
          `steps.${c.steps.length - 1}.pages.${pi}.items.${ii}`,
          `the exam repeats "${sentence}" from the lesson; use a fresh example`,
        );
    }),
  );
}

/** Comparable full sentences of a grammar item (with its answer filled in); rows and placeholders have none. */
function grammarSentences(item: GrammarItem): string[] {
  const sentence = (s: string) =>
    s
      .normalize('NFC')
      .toLowerCase()
      .replace(/[’ʼ]/g, "'")
      .replace(/->|→/g, ' ')
      .replace(/[^\p{L}\p{N}']+/gu, ' ')
      .trim();
  switch (item.type) {
    case 'grammar_explanation':
      return item.examples.map((e) => sentence(e.text));
    case 'grammar_gap_typing':
      return [sentence(`${item.before} ${item.accepted.answers[0]} ${item.after}`)];
    case 'grammar_gap_choice':
      return [
        sentence(
          `${item.before} ${item.choices.find((ch) => ch.choiceId === item.answerChoiceId)?.text ?? ''} ${item.after}`,
        ),
      ];
    case 'grammar_word_order':
      return [
        sentence(
          item.acceptedOrders[0]
            .map((id) => item.tokens.find((t) => t.tokenId === id)?.text ?? '')
            .join(' '),
        ),
      ];
    case 'grammar_error_spotter':
      return [
        sentence(
          item.tokens
            .map((t) =>
              t.tokenId === item.faultyTokenId ? item.correction.accepted.answers[0] : t.text,
            )
            .join(' '),
        ),
      ];
    default:
      return [];
  }
}

/* ======================================================= function lessons */

/** Comparable form of a French sentence: case, apostrophes, spaces and final punctuation ignored. */
const plain = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .replace(/[\s.!?…]+$/u, '')
    .trim();

/** Brief (D51): situation, roles, expressions and words with example sentences. */
function checkFunctionsBrief(b: FunctionsBrief, ctx: OutlineContext, issues: Issues) {
  issues.unique(
    [...b.expressions.map((e) => e.id), ...b.words.map((w) => w.id), ...b.roles.map((r) => r.id)],
    'expressions',
    'expression, word or role ID',
  );
  issues.unique(
    b.expressions.map((e) => plain(e.text)),
    'expressions',
    'expression text',
  );
  issues.unique(
    b.words.map((w) => plain(w.teachingForm)),
    'words',
    'word',
  );
  issues.unique(
    b.roles.map((r) => plain(r.label)),
    'roles',
    'role label',
  );
  b.expressions.forEach((e, i) => {
    const p = `expressions.${i}`;
    issues.check(
      !/(\.\.\.|…)\s*$/u.test(e.text),
      `${p}.text`,
      'write sentence starts without the ellipsis and set openEnd',
    );
    issues.check(
      plain(e.example.text).includes(plain(e.text)),
      `${p}.example`,
      `the example sentence must use the expression "${e.text}"`,
    );
    if (CHARACTER_ONLY.test(e.explanation.en))
      issues.add(
        `${p}.explanation`,
        'explanations name the mark (accent aigu, cédille…), not only the character',
      );
  });
  b.words.forEach((w, i) => {
    const p = `words.${i}`;
    if (w.wordClass === 'noun') {
      issues.check(
        w.genders.length > 0,
        `${p}.genders`,
        'a noun needs at least one accepted gender',
      );
      if (ctx.lang === 'fr')
        issues.check(
          FR_INDEFINITE.test(w.teachingForm),
          `${p}.teachingForm`,
          `"${w.teachingForm}" must include the indefinite article un/une/des (D39)`,
        );
    } else issues.check(w.genders.length === 0, `${p}.genders`, 'only nouns have a gender (D8)');
    if (ctx.lang === 'fr')
      issues.check(
        !FR_ARTICLE_START.test(w.term),
        `${p}.term`,
        `"${w.term}" must be the base term without article`,
      );
    issues.check(
      plain(w.example.text).includes(plain(w.term)),
      `${p}.example`,
      `the example sentence must use the word "${w.term}"`,
    );
  });
  for (const locale of nativeLocales(ctx.lang)) {
    issues.unique(
      b.expressions.map((e) => e.translations[locale]?.[0] ?? ''),
      'expressions',
      `${locale} translation (matching labels must differ)`,
    );
    issues.unique(
      b.words.map((w) => w.translations[locale]?.[0] ?? ''),
      'words',
      `${locale} translation (matching labels must differ)`,
    );
  }
}

/** The steps and pages a function lesson must have for its brief (SPEC section 8, "Page rules"). */
function checkFunctionsContent(c: FunctionsContent, b: FunctionsBrief, issues: Issues) {
  const L = FUNCTIONS_LIMITS,
    R = FUNCTIONS_PAGE_RULES;
  const expressionIds = b.expressions.map((e) => e.id),
    wordIds = b.words.map((w) => w.id);
  const nounIds = b.words.filter((w) => w.wordClass === 'noun').map((w) => w.id);
  const expressions = new Map(b.expressions.map((e) => [e.id, e]));
  const roles = new Set(b.roles.map((r) => r.id));
  const role = (id: string, path: string) =>
    issues.check(roles.has(id), path, `unknown role ${id}`);
  const expression = (id: string, path: string) =>
    issues.check(expressions.has(id), path, `unknown expression ${id}`);
  const step = new Map(c.steps.map((s) => [s.stage, s]));
  const before = issues.list.length;
  // The gender step exists exactly when the lesson has nouns (P4-05 review; nouns only since P06-00).
  const stages = FUNCTIONS_STAGES.filter((s) => s !== 'gender' || nounIds.length > 0);
  issues.check(
    c.steps.length === stages.length,
    'steps',
    `expected ${stages.length} steps: ${stages.join(', ')}`,
  );
  c.steps.forEach((s, i) => {
    issues.check(
      s.stage === stages[i],
      `steps.${i}.stage`,
      `expected the ${stages[i]} step here (section 8)`,
    );
    issues.check(
      s.role ===
        (s.stage === 'exam'
          ? 'exam'
          : s.stage === 'flashcards' || s.stage === 'dialogue'
            ? 'presentation'
            : 'exercise'),
      `steps.${i}.role`,
      `wrong role for the ${s.stage} step`,
    );
  });
  if (issues.list.length > before) return;
  const items = (stage: (typeof FUNCTIONS_STAGES)[number]) =>
    step.get(stage)!.pages.flatMap((pg) => pg.items);
  const only = <T extends FunctionsItem['type']>(
    stage: (typeof FUNCTIONS_STAGES)[number],
    ...types: T[]
  ) => {
    const list = items(stage);
    issues.check(
      list.every((it) => (types as string[]).includes(it.type)),
      `steps.${stage}`,
      `the ${stage} step holds ${types.join(' and ')} items only`,
    );
    return list.filter((it): it is Extract<FunctionsItem, { type: T }> =>
      (types as string[]).includes(it.type),
    );
  };
  const pageSizes = (stage: (typeof FUNCTIONS_STAGES)[number]) =>
    step.get(stage)!.pages.map((pg) => pg.items.length);

  // Flashcards (P4-05 review): one page of all words (none without words), then one page of all expressions.
  const cards = only('flashcards', 'function_flashcards');
  const deck = [
    ...(wordIds.length ? [['words', wordIds] as const] : []),
    ['expressions', expressionIds] as const,
  ];
  issues.check(
    cards.length === deck.length &&
      pageSizes('flashcards').every((n) => n === 1) &&
      deck.every(([side, ids], n) => cards[n].side === side && sameSet(cards[n].ids, ids)),
    'steps.flashcards',
    'one page with every word (when the lesson has words), then one page with every expression',
  );

  // Gender page (P4-05 review): every noun on one page, as in vocabulary stage 4; other words are left out (P06-00).
  if (nounIds.length) {
    const gender = only('gender', 'function_gender_select');
    issues.check(
      gender.length === 1 &&
        pageSizes('gender').length === 1 &&
        gender[0].ids.join() === nounIds.join(),
      'steps.gender',
      'one gender page with every noun in brief order',
    );
  }

  // Model dialogue: one page, alternating roles, every expression used.
  const dialogue = only('dialogue', 'function_dialogue');
  if (
    issues.check(
      dialogue.length === 1,
      'steps.dialogue',
      'the model dialogue is one item on one page',
    )
  ) {
    const lines = dialogue[0].lines;
    issues.unique(
      lines.map((l) => l.lineId),
      'steps.dialogue',
      'line ID',
    );
    lines.forEach((l, n) => {
      const p = `steps.dialogue.lines.${n}`;
      role(l.roleId, p);
      if (n > 0) issues.check(l.roleId !== lines[n - 1].roleId, p, 'the roles alternate');
      for (const id of l.expressionIds)
        if (expression(id, p))
          issues.check(
            plain(l.text).includes(plain(expressions.get(id)!.text)),
            p,
            `the line does not contain the expression "${expressions.get(id)!.text}"`,
          );
    });
    const used = new Set(lines.flatMap((l) => l.expressionIds));
    for (const id of expressionIds)
      issues.check(
        used.has(id),
        'steps.dialogue',
        `the model dialogue does not use expression ${id}`,
      );
  }

  // Matching: the expressions in balanced pages of at most six pairs, then the words on their own page.
  const matching = only('matching', 'function_matching');
  const expected = [
    ...chunk(expressionIds, R.matchingPageSize).map((ids) => ['expressions', ids] as const),
    ...(wordIds.length ? [['words', wordIds] as const] : []),
  ];
  issues.check(
    matching.length === expected.length &&
      pageSizes('matching').every((n) => n === 1) &&
      expected.every(
        ([side, ids], n) =>
          matching[n].side === side && matching[n].pairs.map((p) => p.id).join() === ids.join(),
      ),
    'steps.matching',
    `matching pages: ${expected.map(([side, ids]) => `${ids.length} ${side}`).join(', ')} in brief order (at most ${R.matchingPageSize} pairs per page; words on their own page)`,
  );

  // Word order and dialogue gaps: one item per page and one per expression.
  const perExpression = (
    stage: 'word_order' | 'dialogue_gaps' | 'listening',
    list: { expressionId: string }[],
  ) => {
    issues.check(
      pageSizes(stage).every((n) => n === 1),
      `steps.${stage}`,
      'one item per page',
    );
    issues.check(
      sameSet(
        list.map((it) => it.expressionId),
        expressionIds,
      ),
      `steps.${stage}`,
      'exactly one item per expression',
    );
  };
  const orders = only('word_order', 'function_word_order');
  perExpression('word_order', orders);
  orders.forEach((it, n) => {
    const p = `steps.word_order.items.${n}`;
    issues.check(
      it.context === null && it.roleId === null && it.distractorTokenIds.length === 0,
      p,
      'practice word order has tokens only: no context, role or distractors',
    );
    checkWordOrder(it, p, expressions, issues);
  });
  const gaps = only('dialogue_gaps', 'function_dialogue_gap_choice');
  perExpression('dialogue_gaps', gaps);
  gaps.forEach((it, n) => {
    const p = `steps.dialogue_gaps.items.${n}`;
    role(it.context.roleId, `${p}.context`);
    role(it.roleId, p);
    issues.check(it.context.roleId !== it.roleId, p, 'the gap line belongs to the other role');
    issues.check(
      it.before === it.before.trim() && it.after === it.after.trim(),
      p,
      'before and after carry no surrounding spaces (the renderer adds them)',
    );
    issues.check(
      new Set(it.choiceExpressionIds).size === 4 &&
        it.choiceExpressionIds.includes(it.expressionId),
      `${p}.choiceExpressionIds`,
      'four distinct expressions including the answer',
    );
    it.choiceExpressionIds.forEach((id) => expression(id, `${p}.choiceExpressionIds`));
    checkExplanations([it], p, issues);
  });
  // Listening choice (P4-05 review): one per expression; four distinct spoken replies, the answer uses the expression.
  const listening = only('listening', 'function_listening_choice');
  perExpression('listening', listening);
  listening.forEach((it, n) => {
    const p = `steps.listening.items.${n}`;
    role(it.context.roleId, `${p}.context`);
    role(it.roleId, p);
    issues.check(it.context.roleId !== it.roleId, p, 'the reply belongs to the other role');
    issues.unique(
      it.options.map((o) => o.optionId),
      p,
      'option ID',
    );
    issues.unique(
      it.options.map((o) => plain(o.text)),
      p,
      'option text',
    );
    const answer = it.options.find((o) => o.optionId === it.answerOptionId);
    if (
      issues.check(answer !== undefined, p, 'answerOptionId must be one of the options') &&
      answer &&
      expression(it.expressionId, p)
    ) {
      issues.check(
        plain(answer.text).includes(plain(expressions.get(it.expressionId)!.text)),
        p,
        `the answer does not contain the expression "${expressions.get(it.expressionId)!.text}"`,
      );
    }
    checkExplanations([it], p, issues);
  });

  // Exam: reply pages (at most four, balanced), then one page with the exam dialogue.
  const allExamPages = step.get('exam')!.pages;
  // Word translation first when the lesson has words (P4-05 review): every word once, its teaching form accepted.
  const hasWords = wordIds.length > 0;
  const translation = hasWords ? (allExamPages[0]?.items ?? []) : [];
  if (hasWords) {
    const ok =
      translation.length > 0 && translation.every((it) => it.type === 'function_translation_exam');
    if (
      issues.check(
        ok,
        'steps.exam',
        'the exam starts with one page translating every word of the lesson',
      )
    ) {
      const items = translation as Extract<FunctionsItem, { type: 'function_translation_exam' }>[];
      issues.check(
        items.map((it) => it.wordId).join() === wordIds.join(),
        'steps.exam',
        'the translation page has every word once, in brief order',
      );
      for (const [n, it] of items.entries()) {
        const w = b.words.find((x) => x.id === it.wordId);
        if (w)
          issues.check(
            it.accepted.answers.includes(w.teachingForm),
            `steps.exam.translation.${n}`,
            `accepts the teaching form "${w.teachingForm}"`,
          );
        checkExplanations([it], `steps.exam.translation.${n}`, issues);
      }
    }
  }
  const examPages = hasWords ? allExamPages.slice(1) : allExamPages;
  const replies = examPages.slice(0, -1).flatMap((pg) => pg.items);
  const last = examPages.at(-1)!.items;
  issues.check(
    replies.every((it) => it.type === 'function_word_order') &&
      last.length === 1 &&
      last[0].type === 'function_dialogue_gap_typing',
    'steps.exam',
    'reply pages (word order) followed by one page with the exam dialogue',
  );
  const replyItems = replies.filter((it) => it.type === 'function_word_order');
  issues.check(
    replyItems.length >= L.examReplies[0] && replyItems.length <= L.examReplies[1],
    'steps.exam',
    `the exam has ${L.examReplies[0]}–${L.examReplies[1]} replies`,
  );
  const sizes = examPages.slice(0, -1).map((pg) => pg.items.length);
  issues.check(
    sizes.join() ===
      chunk(replyItems, R.replyPageSize)
        .map((x) => x.length)
        .join(),
    'steps.exam',
    `replies stand in balanced pages of at most ${R.replyPageSize}`,
  );
  const practiceSentences = new Set([
    ...b.expressions.map((e) => plain(e.example.text)),
    ...b.words.map((w) => plain(w.example.text)),
    ...orders.map((it) => plain(sentence(it))),
    ...gaps.map((it) =>
      plain(`${it.before} ${expressions.get(it.expressionId)?.text ?? ''} ${it.after}`),
    ),
    ...dialogue.flatMap((d) => d.lines.map((l) => plain(l.text))),
    ...listening.map((it) =>
      plain(it.options.find((o) => o.optionId === it.answerOptionId)?.text ?? ''),
    ),
  ]);
  replyItems.forEach((it, n) => {
    const p = `steps.exam.replies.${n}`;
    if (
      issues.check(
        it.context !== null && it.roleId !== null,
        p,
        "an exam reply has role A's line as context and the role of the reply",
      )
    ) {
      role(it.context!.roleId, `${p}.context`);
      role(it.roleId!, p);
      issues.check(it.context!.roleId !== it.roleId, p, 'the reply belongs to the other role');
    }
    checkWordOrder(it, p, expressions, issues);
    issues.check(
      !practiceSentences.has(plain(sentence(it))),
      p,
      `"${sentence(it)}" already occurs in the brief or in practice`,
    );
  });
  const examined = new Set(replyItems.map((it) => it.expressionId));
  if (last[0]?.type === 'function_dialogue_gap_typing') {
    const lines = last[0].lines;
    const p = 'steps.exam.dialogue';
    issues.unique(
      lines.map((l) => l.lineId),
      p,
      'line ID',
    );
    issues.unique(
      lines.flatMap((l) => (l.gap ? [l.gap.gapId] : [])),
      p,
      'gap ID',
    );
    const gapCount = lines.filter((l) => l.gap).length;
    issues.check(
      gapCount >= L.examGaps[0] && gapCount <= L.examGaps[1],
      p,
      `the exam dialogue has ${L.examGaps[0]}–${L.examGaps[1]} gaps`,
    );
    lines.forEach((l, n) => {
      const lp = `${p}.lines.${n}`;
      role(l.roleId, lp);
      if (n > 0) issues.check(l.roleId !== lines[n - 1].roleId, lp, 'the roles alternate');
      issues.check(
        l.gap !== null || (l.before.trim() !== '' && l.after === ''),
        lp,
        'a line without a gap keeps its whole text in before',
      );
      issues.check(
        l.before === l.before.trim() && l.after === l.after.trim(),
        lp,
        'before and after carry no surrounding spaces (the renderer adds them)',
      );
      if (l.gap && expression(l.gap.expressionId, lp)) {
        examined.add(l.gap.expressionId);
        issues.check(
          l.gap.accepted.answers.some(
            (a) => plain(a) === plain(expressions.get(l.gap!.expressionId)!.text),
          ),
          lp,
          `the accepted answers include the expression "${expressions.get(l.gap.expressionId)!.text}"`,
        );
        checkExplanations([l.gap], lp, issues);
      }
      const full = plain(`${l.before} ${l.gap?.accepted.answers[0] ?? ''} ${l.after}`);
      if (l.gap)
        issues.check(
          Object.values(l.translation).every(
            (tr) => !plain(tr).includes(plain(l.gap!.accepted.answers[0])),
          ),
          lp,
          'the translation must not contain the French answer',
        );
      if (l.gap)
        issues.check(
          !practiceSentences.has(full),
          lp,
          'the line already occurs in the brief or in practice',
        );
    });
  }
  for (const id of expressionIds)
    issues.check(examined.has(id), 'steps.exam', `the exam does not assess expression ${id}`);

  // Page estimates and exam limits follow the page rules.
  c.steps.forEach((s, si) =>
    s.pages.forEach((pg, pi) => {
      const pp = `steps.${si}.pages.${pi}`;
      const estimate = functionsPageEstimate(pg.items, s.stage === 'exam');
      issues.check(
        pg.estimatedDurationS === estimate,
        `${pp}.estimatedDurationS`,
        `must be ${estimate} s by the page rules (section 8)`,
      );
      const limit = s.stage === 'exam' ? functionsTimeLimit(estimate) : null;
      issues.check(
        pg.timeLimitS === limit,
        `${pp}.timeLimitS`,
        limit === null ? 'only exam pages have a countdown' : `must be ${limit} s (1.5 × estimate)`,
      );
    }),
  );
}

/** The sentence of a word-order item in its first accepted order. */
const sentence = (it: Extract<FunctionsItem, { type: 'function_word_order' }>) =>
  it.acceptedOrders[0].map((id) => it.tokens.find((t) => t.tokenId === id)?.text ?? '').join(' ');

function checkWordOrder(
  it: Extract<FunctionsItem, { type: 'function_word_order' }>,
  path: string,
  expressions: Map<string, FunctionsBrief['expressions'][number]>,
  issues: Issues,
) {
  const all = it.tokens.map((t) => t.tokenId);
  issues.unique(all, path, 'token ID');
  issues.check(
    it.distractorTokenIds.every((id) => all.includes(id)),
    path,
    'distractors must be tokens of the item',
  );
  const used = all.filter((id) => !it.distractorTokenIds.includes(id));
  for (const order of it.acceptedOrders)
    issues.check(
      order.length === used.length && sameSet(order, used),
      path,
      'each accepted order uses every token except the distractors exactly once',
    );
  const e = expressions.get(it.expressionId);
  if (issues.check(e !== undefined, path, `unknown expression ${it.expressionId}`) && e)
    issues.check(
      plain(sentence(it)).includes(plain(e.text)),
      path,
      `the sentence does not contain the expression "${e.text}"`,
    );
  checkExplanations([it], path, issues);
}

export function validateContent(
  data: unknown,
  ctx: ContentContext,
): ValidationResult<LessonContent> {
  if (!isSupportedKind(ctx.entry.kind)) {
    return {
      status: 'invalid',
      issues: [
        { path: 'kind', message: `${ctx.entry.kind} lessons have no agreed content schema yet` },
      ],
      staleReasons: [],
    };
  }
  if (!hasContentFile(ctx.entry.kind)) {
    return {
      status: 'invalid',
      issues: [
        {
          path: '',
          message: 'vocabulary lessons have no content file: the brief is the whole lesson (P2-04)',
        },
      ],
      staleReasons: [],
    };
  }
  const parsed = contentSchema(ctx.entry.kind, ctx.lang).safeParse(data);
  if (!parsed.success)
    return { status: 'invalid', issues: schemaIssues(parsed.error), staleReasons: [] };
  const content = parsed.data;
  const issues = new Issues();
  checkEnvelope(content, ctx, issues);

  type AnyPage = { pageId: string; estimatedDurationS: number; items: { itemId: string }[] };
  const steps: { id: string; pages: AnyPage[] }[] = content.steps;
  const pages = steps.flatMap((s) => s.pages);
  issues.unique(
    steps.map((s) => s.id),
    'steps',
    'step ID',
  );
  issues.unique(
    pages.map((p) => p.pageId),
    'steps',
    'page ID',
  );
  issues.unique(
    pages.flatMap((p) => p.items.map((i) => i.itemId)),
    'steps',
    'item ID',
  );
  checkMinutes(content.estimatedMinutes, sum(pages.map((p) => p.estimatedDurationS)), issues);

  if (content.kind === 'grammar' && ctx.brief.kind === 'grammar')
    checkGrammarContent(content, ctx.brief, issues);
  if (content.kind === 'functions' && ctx.brief.kind === 'functions')
    checkFunctionsContent(content, ctx.brief, issues);
  if (content.kind === 'reading' && ctx.brief.kind === 'reading')
    checkReadingContent(content, ctx.brief, issues);

  const stale: string[] = [];
  if (ctx.outlineHash && content.provenance.inputHashes.outline !== ctx.outlineHash)
    stale.push('the outline entry changed after this content was generated');
  if (ctx.briefHash && content.provenance.inputHashes.brief !== ctx.briefHash)
    stale.push('the brief changed after this content was generated');
  return finish(content, issues, stale);
}
