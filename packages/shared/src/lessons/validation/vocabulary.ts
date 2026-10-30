import type { Language } from '../../schemas/language';
import { nativeLocales } from '../schemas/artifactCommon';
import type { VocabularyBrief, VocabularyTarget } from '../schemas/vocabulary';
import { matchingPages, vocabularyLesson } from '../domain/vocabularyLesson';
import {
  hasGender,
  isArticle,
  nounGenders,
  startsWithArticle,
  TEACHING_ARTICLES,
  teachingArticle,
} from '../domain/articles';
import { checkMarkNamed, checkMinutes, checkRichText, sameSet } from './common';
import type { OutlineContext } from './artifacts';
import type { Issues } from './issues';

/**
 * The checks of a vocabulary brief beyond its schema.
 *
 * A vocabulary lesson is its brief alone: ../domain/vocabularyLesson.ts
 * builds every page from it. So this is the only check a vocabulary
 * lesson gets, and it looks at three things:
 *
 * - the lists: every target id unique, every target in exactly one group,
 *   targetCount right;
 * - each word's forms: only nouns have a gender and a number, and a
 *   French or German noun is taught and examined with its article ("un livre");
 * - each word's exercise texts: the gap, the listening options, the
 *   explanations and the matching labels must give exactly one right
 *   answer.
 *
 * When all of that holds, it builds the lesson to check estimatedMinutes.
 */
export function checkVocabularyBrief(b: VocabularyBrief, ctx: OutlineContext, issues: Issues) {
  const ids = b.targets.map((t) => t.id);
  const groupIds = b.groups.map((g) => g.id);
  issues.unique(ids, 'targets', 'target ID');
  issues.check(
    b.targets.length === b.targetCount,
    'targetCount',
    `is ${b.targetCount} but ${b.targets.length} targets are listed`,
  );
  issues.unique(groupIds, 'groups', 'group ID');
  issues.check(
    sameSet(
      b.groups.flatMap((g) => g.targetIds),
      ids,
    ),
    'groups',
    'every target must belong to exactly one group',
  );

  b.targets.forEach((t, i) => checkForms(t, `targets.${i}`, ctx.lang, issues));
  b.targets.forEach((t, i) => checkExerciseTexts(t, `targets.${i}`, b, ctx.lang, issues));
  b.groups.forEach((g, i) => checkRichText(g.introduction, `groups.${i}.introduction`, issues));
  checkMatchingLabels(b, ctx.lang, issues);

  // The lesson can only be built from a brief without issues.
  if (!issues.list.length)
    checkMinutes(
      b.estimatedMinutes,
      vocabularyLesson(b)
        .steps.flatMap((s) => s.pages)
        .reduce((n, pg) => n + pg.estimatedDurationS, 0),
      issues,
    );
}

/* =================================================================== forms */

/**
 * The article rule: in French and German a noun is taught and examined
 * with its article, and the article agrees with the noun.
 *
 *   fr  un livre, une table, des ciseaux, un élève / une élève
 *   de  der Tisch, die Lampe, das Buch, die Bücher
 *   en  no rule
 *
 * Returns what is wrong with `form`, or undefined when it is right.
 */
function articleIssue(t: VocabularyTarget, form: string, lang: Language): string | undefined {
  const rule = TEACHING_ARTICLES[lang];
  if (!rule) return undefined;
  const article = teachingArticle(lang, form);
  if (!article)
    return `"${form}" must include the ${rule.label}, or the target must declare an articleException`;
  const allowed =
    t.number === 'plural' ? [rule.plural] : t.genders.flatMap((g) => rule.singular[g] ?? []);
  // No gender of the language (a French neuter): checkForms reports it.
  if (allowed.length && !allowed.includes(article))
    return `"${form}" uses "${article}" but a ${t.number} ${t.genders.join('/')} noun takes ${allowed.join(' or ')}`;
  return undefined;
}

/**
 * The forms of one word. Only a noun has genders, a number and an
 * article; a French or German noun's forms carry the right article, unless
 * the word has an articleException (a country, a set phrase). The term,
 * shown alone in the gender exercise, never has one: that would give the
 * answer.
 */
function checkForms(t: VocabularyTarget, p: string, lang: Language, issues: Issues) {
  const rule = TEACHING_ARTICLES[lang];
  if (t.wordClass === 'noun') {
    if (hasGender(lang)) {
      issues.check(
        t.genders.length > 0,
        `${p}.genders`,
        'a noun needs at least one accepted gender',
      );
      issues.check(
        t.genders.every((g) => nounGenders(lang).includes(g)),
        `${p}.genders`,
        `${lang} nouns are ${nounGenders(lang).join(' or ')}`,
      );
    } else issues.check(t.genders.length === 0, `${p}.genders`, `${lang} nouns have no gender`);
    issues.check(t.number !== null, `${p}.number`, 'a noun needs a grammatical number');
    if (rule && t.articleException === null) {
      for (const f of t.examForms) {
        const m = articleIssue(t, f, lang);
        issues.check(!m, `${p}.examForms`, m ?? '');
      }
      const m = articleIssue(t, t.teachingForm, lang);
      issues.check(!m, `${p}.teachingForm`, m ?? '');
      for (const v of t.genderVariants)
        issues.check(
          teachingArticle(lang, v) !== undefined,
          `${p}.genderVariants`,
          `"${v}" must include the ${rule.label}`,
        );
    }
    if (rule && t.articleException !== null)
      issues.check(
        !t.examForms.some((f) => teachingArticle(lang, f)),
        `${p}.articleException`,
        `remove the articleException: the exam forms use ${lang === 'fr' ? 'an indefinite article' : 'an article'}`,
      );
    if (!rule)
      issues.check(
        t.articleException === null,
        `${p}.articleException`,
        `${lang} nouns are taught without an article; articleException must be null`,
      );
    issues.check(
      !startsWithArticle(lang, t.term),
      `${p}.term`,
      `"${t.term}" must be the base term without article`,
    );
  } else {
    issues.check(t.genders.length === 0, `${p}.genders`, 'only nouns have a gender');
    issues.check(t.number === null, `${p}.number`, 'only nouns have a grammatical number here');
    issues.check(
      t.articleException === null,
      `${p}.articleException`,
      'only nouns can have an article exception',
    );
  }
  // What is shown is what is examined: one exam form, or an adjective's pair ("espagnol, espagnole").
  issues.check(
    t.examForms.includes(t.teachingForm) || t.teachingForm === t.examForms.join(', '),
    `${p}.teachingForm`,
    `"${t.teachingForm}" must be one of the exam forms: the form taught is the form examined`,
  );
}

/* ========================================================== exercise texts */

/**
 * The texts of one word's exercises. Every word takes part in every
 * exercise, so each word brings its own:
 *
 * - gap: a sentence with the word missing, and four reference words to
 *   choose from (the word and three others of the lesson). Only the word
 *   may fit, and the typed answer has no article;
 * - listening: four words of the lesson to choose from, the word included;
 * - explanations: name the accent, not only the letter;
 * - examPrompt: when the word has gender variants (espagnol, espagnole),
 *   the exam question must say which one it wants, in every mother tongue.
 */
function checkExerciseTexts(
  t: VocabularyTarget,
  p: string,
  b: VocabularyBrief,
  lang: Language,
  issues: Issues,
) {
  const known = (id: string, path: string) =>
    issues.check(
      b.targets.some((x) => x.id === id),
      path,
      `unknown target ${id}`,
    );
  const noun = t.wordClass === 'noun';
  const gendered = noun && t.genders.length > 0;
  issues.check(
    (t.genderExplanation !== null) === gendered,
    `${p}.genderExplanation`,
    gendered
      ? 'required for a noun'
      : noun
        ? 'a noun without gender has no gender explanation'
        : 'only nouns have a gender explanation',
  );

  const refs = t.gap.referenceTargetIds;
  issues.check(
    new Set(refs).size === 4 && refs.includes(t.id),
    `${p}.gap.referenceTargetIds`,
    'four distinct reference targets including the word',
  );
  refs.forEach((id) => known(id, `${p}.gap.referenceTargetIds`));
  for (const a of t.gap.accepted.answers)
    issues.check(
      !startsWithArticle(lang, a) && (!isArticle(lang, a) || t.wordClass === 'numeral'),
      `${p}.gap.accepted`,
      `typed-gap answer "${a}" must be article-free`,
    );
  const otherTerms = refs
    .filter((id) => id !== t.id)
    .map((id) => b.targets.find((x) => x.id === id)?.term.toLowerCase());
  issues.check(
    !t.gap.accepted.answers.some((a) => otherTerms.includes(a.toLowerCase())),
    `${p}.gap`,
    'exactly one reference choice may fit the gap',
  );

  const options = t.listeningOptionTargetIds;
  issues.check(
    new Set(options).size === 4 && options.includes(t.id),
    `${p}.listeningOptionTargetIds`,
    'four distinct options including the word',
  );
  options.forEach((id) => known(id, `${p}.listeningOptionTargetIds`));

  checkMarkNamed(t.explanation, `${p}.explanation`, issues);
  checkMarkNamed(t.gap.explanation, `${p}.gap.explanation`, issues);
  checkMarkNamed(t.genderExplanation, `${p}.genderExplanation`, issues);

  const prompt = t.examPrompt;
  if (t.genderVariants.length && prompt)
    issues.check(
      nativeLocales(lang).every((l) => prompt[l] !== t.translations[l]?.[0]),
      `${p}.examPrompt`,
      'must disambiguate gender/number in every mother tongue, or be null so every gender variant is accepted',
    );
}

/**
 * On a matching page, the learner pairs each word with its translation,
 * so two words of the same page must not show the same label (the first
 * translation, or matchingLabel when set). Checked page by page, in every
 * mother tongue, with the pages the lesson will have.
 */
function checkMatchingLabels(b: VocabularyBrief, lang: Language, issues: Issues) {
  matchingPages(b).forEach((ids, n) => {
    const page = ids.map((id) => b.targets.find((t) => t.id === id)).filter((t) => t !== undefined);
    for (const locale of nativeLocales(lang))
      issues.unique(
        page.map((t) => t.matchingLabel?.[locale] ?? t.translations[locale]?.[0] ?? ''),
        `matching.${n + 1}`,
        `${locale} matching label (set matchingLabel)`,
      );
  });
}
