import type { LessonOutline } from '@/components/lesson/types';

export const SECTION_COLORS = ['#a5b4fc', '#67e8f9', '#f9a8d4', '#fcd34d', '#86efac'];

/** The outline already numbers teaching points; several practice pages can belong to one. */
export function lessonPoints(outline: LessonOutline) {
  const points = outline.sections.flatMap((section, sectionIndex) =>
    section.points.map((point) => ({
      ...point,
      color: SECTION_COLORS[sectionIndex % SECTION_COLORS.length]!,
      pages: [] as number[],
    })),
  );
  let pointIndex = -1;
  outline.pages.forEach((page, index) => {
    if (page.role !== 'presentation' && page.role !== 'practice') return;
    const previous = outline.pages[index - 1];
    if (
      page.role === 'presentation' ||
      previous?.role !== 'practice' ||
      JSON.stringify(previous.step) !== JSON.stringify(page.step)
    ) {
      pointIndex += 1;
    }
    points[pointIndex]?.pages.push(index);
  });
  return points;
}
