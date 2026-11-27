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
 * sheet, ignores pushState. Through href, as a link would: the hash setter does
 * nothing when the URL already has the fragment, which a change landing late
 * can leave under a sheet in the other state.
 */
const moveHash = (hash: string) => {
  const state: unknown = window.history.state;
  // Only the fragment moves, on the same page: no navigation for the router to do.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `#${hash}`;
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
  // will: they go with it. A link of the list (a chip, Clear filters, the
  // pager) counts as sent too, once followLink has put the fields on its view.
  const sent = useRef<string[]>([]);
  // The view a link of the list is on its way to: it opens at the top, as a
  // navigation the form did not send does.
  const linkTarget = useRef<string | null>(null);
  // The query the fields were last put on. The page renders them from it, so
  // the first run has nothing to reset: resetting would wipe what was typed
  // before the page hydrated.
  const shown = useRef(searchParams.toString());

  // Puts the fields back on the view shown, from the defaults the server
  // rendered, and forgets what the form sent: none of it will land now.
  const putBack = useCallback(() => {
    sent.current = [];
    linkTarget.current = null;
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
    // From lg the page scrolls in a pane, which a query-only navigation
    // leaves where it was: Next at the bottom would open page 2 at its end.
    // Not after the form's own changes: the box under the pointer would move.
    const toTop = () => form.current?.closest('[data-scroll-pane]')?.scrollTo({ top: 0 });
    const own = sent.current.indexOf(now);
    if (own !== -1) {
      sent.current = sent.current.slice(own + 1);
      const link = linkTarget.current;
      if (now === link) toTop();
      // Landed, or older than what landed and dropped with it: it never lands now.
      if (link !== null && !sent.current.includes(link)) linkTarget.current = null;
      return;
    }
    putBack();
    toTop();
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
      timer.current = undefined;
      if (form.current === null) return;
      const data = new FormData(form.current);
      // The checked boxes, read from the boxes rather than from FormData, which
      // skips a disabled field. An older view of the form's own landing while
      // the learner is still clicking can disable a box they just checked (its
      // count there is 0, #223): it must still be sent, or it would stay checked
      // on screen and drop out of the list. The view it lands on has it checked,
      // which enables it again. As arrays, which the schema reads like comma lists.
      const checked = (name: string) =>
        Array.from(
          form.current?.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][name="${name}"]:checked`,
          ) ?? [],
          (box) => box.value,
        );
      const query = LessonQuerySchema.parse({
        q: data.get('q'),
        status: checked('status'),
        kind: checked('kind'),
        topic: checked('topic'),
        theme: checked('theme'),
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

  /**
   * A chip, Clear filters or a page of the pager (#226). Until its view lands,
   * the fields still show the old one, and a change made meanwhile would send
   * them and undo the link: Clear filters, then Grammar, gave the old filters
   * plus Grammar. So the fields move to the link's view at once, and its query
   * counts as one the form sent: when it lands, the fields stay as they are
   * then, with whatever changed since. A search still waiting is dropped, as
   * the view it would have left is.
   *
   * Next's Link still does the navigation. A click that opens a new tab, or a
   * link off the list (a lesson), changes nothing here.
   */
  const followLink = (event: MouseEvent, link: HTMLAnchorElement) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const url = new URL(link.href);
    if (url.pathname !== window.location.pathname || form.current === null) return;
    clearTimeout(timer.current);
    timer.current = undefined;

    const query = LessonQuerySchema.parse(Object.fromEntries(url.searchParams));
    for (const field of Array.from(form.current.elements)) {
      if (field instanceof HTMLInputElement && field.type === 'checkbox') {
        const list: unknown = query[field.name as keyof typeof query];
        if (Array.isArray(list)) field.checked = list.includes(field.value);
      } else if (field instanceof HTMLInputElement && field.name === 'q') {
        field.value = query.q;
      } else if (
        field instanceof HTMLSelectElement &&
        (field.name === 'sort' || field.name === 'dir' || field.name === 'group')
      ) {
        field.value = query[field.name];
      }
    }

    // The same rule as apply's: the view already shown never lands again.
    const target = lessonsHref(lang, query).split('?')[1] ?? '';
    if (target === shown.current) {
      sent.current = [];
      linkTarget.current = null;
      return;
    }
    sent.current = [...sent.current.filter((query) => query !== target), target];
    linkTarget.current = target;
  };

  // Filters, Close and Show the lessons. A change still on its way, or a
  // search still waiting, carries the hash it was sent with, which would undo
  // this as it lands: send the form again with the new one, and Next drops
  // the older push.
  const moveSheet = (hash: string) => {
    moveHash(hash);
    if (pending || timer.current !== undefined) apply(0);
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
        const link = (event.target as Element).closest('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        // Filters and Close: links to the sheet's hash.
        if (link.getAttribute('href')!.startsWith('#')) {
          event.preventDefault();
          moveSheet(link.getAttribute('href')!.slice(1));
          return;
        }
        followLink(event.nativeEvent, link);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        // Show the lessons, in the phone's sheet: every change is applied
        // already, so it only closes the sheet, as Close does.
        if ((event.nativeEvent as SubmitEvent).submitter?.hasAttribute('data-close-sheet')) {
          moveSheet('');
          return;
        }
        apply(0);
      }}
    >
      {children}
    </form>
  );
}
