import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { playable } from '@/components/lesson/kinds';
import { lessonPaths, lessonStage, lessonTitle, loadLesson } from '@/lib/lesson';
import { LessonPlayer } from './player';

/** The attempt changes with every page: never cached. */
export const dynamic = 'force-dynamic';

type Params = Promise<{ lang: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params;
  const title = await lessonTitle(lang, id);
  return title === null ? {} : { title };
}

/**
 * The player (#146): one URL for every page of the lesson. Its state is
 * the server's attempt; with nothing in progress, the lesson page.
 */
export default async function PlayPage({ params }: { params: Params }) {
  const { lang, id } = await params;
  const { lang: course, card, read } = await loadLesson(lang, id);
  const paths = lessonPaths(course, card.id);

  const stage = lessonStage(read.attempt);
  // A kind the browser cannot play yet: the lesson page says so.
  if (
    read.attempt === null ||
    stage === 'new' ||
    stage === 'finished' ||
    !playable(read.outline.kind)
  ) {
    redirect(paths.page);
  }

  return (
    <LessonPlayer
      lang={course}
      id={card.id}
      outline={read.outline}
      initial={read.attempt}
      pagePath={paths.page}
      resultsPath={paths.results}
    />
  );
}
