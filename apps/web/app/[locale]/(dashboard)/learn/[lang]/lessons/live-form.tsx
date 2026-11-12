'use client';

import { useCallback, useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { LessonQuerySchema, type Language } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { lessonsHref } from '@/lib/lesson-list';

/** Typing waits this long before the list follows; a box or a select applies at once. */
const SEARCH_DELAY_MS = 250;

/**
 * Opens or closes the phone's filter sheet (#filters) with an entry Back can
 * come back to. A hash the browser moves alone makes an entry with no state,
 * and Next does nothing on a Back onto one: the URL would change under a view
 * that stays. The hash leaves the query alone, so the entry left holds the
 * right view: its state goes to the new entry. Next lets its own state through
 * replaceState untouched. The hash itself must move: :target, which opens the
 * sheet, ignores pushState.
 */
const moveHash = (hash: string) => {
  const state: unknown = window.history.state;
  window.location.hash = hash;
  window.history.replaceState(state, '', window.location.href);
};

/**
 * The all lessons GET form, applied as it changes. Without JavaScript it is
 * the plain form and its Apply button. With it, every change pushes the URL
 * in a transition, so the rows fade while the server renders the next view,
 * and Back undoes one change, as it does after the plain form's Apply.
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
  // The queries this form sent that can still land, oldest first: its own
  // navigations leave the fields as typed, even when an older one lands while
  // the learner is still typing. A newer one makes Next drop the one on its
  // way, unless it is already landing, so one landing means no older one ever
  // will: they go with it. A chip back to one of those is not the form's own.
  const sent = useRef<string[]>([]);
  // The query the fields were last put on. The page renders them from it, so
  // the first run has nothing to reset: resetting would wipe what was typed
  // before the page hydrated.
  const shown = useRef(searchParams.toString());

  // Puts the fields back on the view shown, from the defaults the server
  // rendered, and forgets what the form sent: none of it will land now.
  const putBack = useCallback(() => {
    sent.current = [];
    // A search still waiting would read the reset form, which has no page,
    // and send the learner away from the view a link opened.
    clearTimeout(timer.current);
    timer.current = undefined;
    // React leaves a select's default where it was mounted, so reset would
    // put it back there: move the default to the shown value first.
    const query = LessonQuerySchema.parse(Object.fromEntries(new URLSearchParams(shown.current)));
    for (const name of ['sort', 'dir', 'group'] as const) {
      const select = form.current?.elements.namedItem(name);
      if (!(select instanceof HTMLSelectElement)) continue;
      for (const option of select.options) option.defaultSelected = option.value === query[name];
    }
    form.current?.reset();
  }, []);

  // Any other navigation (Back, a filter chip, Clear filters) brings new
  // defaults from the server: reset puts the fields on them.
  useEffect(() => {
    const now = searchParams.toString();
    if (now === shown.current) return;
    shown.current = now;
    const own = sent.current.indexOf(now);
    if (own !== -1) {
      sent.current = sent.current.slice(own + 1);
      return;
    }
    putBack();
    // From lg the page scrolls in a pane, which a query-only navigation
    // leaves where it was: Next at the bottom would open page 2 at its end.
    // Not after the form's own changes: the box under the pointer would move.
    form.current?.closest('[data-scroll-pane]')?.scrollTo({ top: 0 });
  }, [searchParams, putBack]);

  // Back and Forward drop a change still on its way too, and can land on the
  // view already shown, which brings no new query for the effect above.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // A hash the browser moves alone comes with no state, and Next ignores
      // it: the view stays, and so does what the form sent.
      if (event.state !== null) putBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [putBack]);

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
      // The query already shown never lands again, so it is not kept; it still
      // drops the ones on their way, and one of those landing is not the form's.
      sent.current =
        sending === shown.current
          ? []
          : [...sent.current.filter((query) => query !== sending), sending];
      // The hash keeps the phone's filter sheet open (#filters) while the list updates.
      startTransition(() => router.push(`${href}${window.location.hash}`, { scroll: false }));
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
      onClick={(event) => {
        // Filters and Close: links to the sheet's hash.
        const link = (event.target as Element).closest('a[href^="#"]');
        if (link === null) return;
        event.preventDefault();
        moveHash(link.getAttribute('href')!.slice(1));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        // Show the lessons, in the phone's sheet: every change is applied
        // already, so it only closes the sheet, as a link to # would.
        if ((event.nativeEvent as SubmitEvent).submitter?.hasAttribute('data-close-sheet')) {
          moveHash('');
          return;
        }
        apply(0);
      }}
    >
      {children}
    </form>
  );
}
