'use client';

import { useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { LessonQuerySchema, type Language } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { lessonsHref } from '@/lib/lesson-list';

/** Typing waits this long before the list follows; a box or a select applies at once. */
const SEARCH_DELAY_MS = 250;

/**
 * The all lessons GET form, applied as it changes. Without JavaScript it is
 * the plain form and its Apply button. With it, every change replaces the URL
 * in a transition, so the rows fade while the server renders the next view,
 * and the history keeps one entry per visit, not one per box.
 */
export function LiveForm({
  lang,
  className,
  children,
}: {
  lang: Language;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The queries this form sent that have not landed yet: its own navigations
  // leave the fields as typed, even when an older one lands while the learner
  // is still typing. Only until they land: a chip back to an earlier query is
  // not the form's own.
  const sent = useRef(new Set<string>());
  // The query the fields were last put on. The page renders them from it, so
  // the first run has nothing to reset: resetting would wipe what was typed
  // before the page hydrated.
  const shown = useRef(searchParams.toString());

  // Any other navigation (Back, a filter chip, Clear filters) brings new
  // defaults from the server: reset puts the fields on them.
  useEffect(() => {
    const now = searchParams.toString();
    if (now === shown.current) return;
    shown.current = now;
    if (sent.current.has(now)) {
      sent.current.delete(now);
    } else {
      sent.current.clear();
      form.current?.reset();
    }
  }, [searchParams]);

  // A change made before hydration had no handler to apply it: apply it now.
  useEffect(() => {
    const fields = Array.from(form.current?.elements ?? []);
    const changed = fields.some((field) =>
      field instanceof HTMLInputElement
        ? field.value !== field.defaultValue || field.checked !== field.defaultChecked
        : field instanceof HTMLSelectElement &&
          Array.from(field.options).some((option) => option.selected !== option.defaultSelected),
    );
    if (changed) apply(SEARCH_DELAY_MS);
    // Once, on mount: later changes go through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmounted mid-typing: the pending search must not navigate away later.
  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (form.current === null) return;
      const data = new FormData(form.current);
      // Repeated checkbox keys come as arrays, which the schema reads like comma lists.
      const query = LessonQuerySchema.parse({
        q: data.get('q'),
        status: data.getAll('status'),
        kind: data.getAll('kind'),
        topic: data.getAll('topic'),
        theme: data.getAll('theme'),
        sort: data.get('sort'),
        dir: data.get('dir'),
        group: data.get('group'),
      });
      const href = lessonsHref(lang, query);
      const sending = href.split('?')[1] ?? '';
      // The query already shown never lands again, so it would stay in sent.
      if (sending !== shown.current) sent.current.add(sending);
      // The hash keeps the phone's filter sheet open (#filters) while the list updates.
      startTransition(() => router.replace(`${href}${window.location.hash}`, { scroll: false }));
    }, delay);
  };

  return (
    <form
      ref={form}
      method="get"
      data-pending={pending ? '' : undefined}
      className={className}
      onChange={(event) => {
        const search = event.target instanceof HTMLInputElement && event.target.type === 'search';
        apply(search ? SEARCH_DELAY_MS : 0);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        apply(0);
      }}
    >
      {children}
    </form>
  );
}
