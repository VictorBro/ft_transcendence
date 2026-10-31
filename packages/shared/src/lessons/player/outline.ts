import type { LocalizedText } from '../schemas/artifactCommon';
import { kindModule } from './kinds';
import type { LessonPlan, PlanPage } from './plan';
import type { LessonOutline } from './view';

/**
 * The outline of a lesson (view.ts's LessonOutline): what the start page,
 * the sidebar and the progress bar show. It is the same before and
 * during an attempt, and holds no key.
 *
 * The sections, in page order:
 * - before the exam, the kind's sections (kinds/<kind>.ts): grammar has
 *   one per teaching block, vocabulary one per word group and then the
 *   exercises, functions the presentation and the exercises, reading the
 *   key words and the document;
 * - then the exam section: the discussion, the exam info page and the
 *   exam pages, with no points of its own.
 *
 * Inside a section, every presentation page is a point, and consecutive
 * practice pages of one step are one point. The points are numbered 1,
 * 2, 3… through the lesson.
 */

/** The discussion page and the exam info page belong to the exam section. */
const inExamSection = (page: PlanPage) =>
  page.role === 'exam' || page.role === 'examIntro' || page.role === 'discussion';

/** Seconds as whole minutes, at least one. */
const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** Labels joined with " · " in each locale, each label once: "Flashcards · Dialogue". */
function joinTitles(titles: LocalizedText[]): LocalizedText {
  const join = (l: keyof LocalizedText) => [...new Set(titles.map((t) => t[l]))].join(' · ');
  return { en: join('en'), fr: join('fr'), de: join('de') };
}

interface Section {
  key: string;
  title?: LocalizedText;
  seconds: number;
  points: { kind: 'theory' | 'practice'; stepId: string; title: LocalizedText }[];
}

export function lessonOutline(plan: LessonPlan): LessonOutline {
  const kind = kindModule(plan.kind);
  const sections: Section[] = [];
  for (const page of plan.pages) {
    const exam = inExamSection(page);
    const { key, title } = exam ? { key: 'exam', title: undefined } : kind.section(page, plan);
    let section = sections.find((s) => s.key === key);
    if (!section) {
      section = { key, title, seconds: 0, points: [] };
      sections.push(section);
    }
    section.seconds += page.estimatedDurationS;
    if (exam) {
      // The exam section takes the label of the exam step.
      if (page.role === 'exam') section.title ??= page.stepLabel;
      continue;
    }
    const last = section.points.at(-1);
    if (page.role === 'presentation')
      section.points.push({ kind: 'theory', stepId: page.stepId, title: kind.pointTitle(page) });
    else if (last?.kind !== 'practice' || last.stepId !== page.stepId)
      section.points.push({ kind: 'practice', stepId: page.stepId, title: page.stepLabel });
  }

  let number = 0;
  const brief = plan.brief;
  return {
    lessonId: plan.lessonId,
    kind: plan.kind,
    title: plan.title,
    objective: plan.objective,
    minutes: minutes(plan.pages.reduce((s, p) => s + p.estimatedDurationS, 0)),
    sections: sections.map((s) => ({
      title: s.title ?? joinTitles(s.points.map((p) => p.title)),
      minutes: minutes(s.seconds),
      points: s.points.map((p) => ({ number: ++number, title: p.title })),
    })),
    ...kind.start(brief, plan),
    pages: plan.pages.map((p) => ({
      role: p.role,
      seconds: p.estimatedDurationS,
      limitS: p.timeLimitS,
      questions: p.units.length,
      step: p.stepLabel,
    })),
  };
}
