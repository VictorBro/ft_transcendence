# #96: feat(web): lesson stub page and the roadmap e2e

> Text of [issue #96](https://github.com/VictorBro/ft_transcendence/issues/96) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

<img width="2560" height="1300" alt="Image" src="https://github.com/user-attachments/assets/fbdf109b-2297-4058-bb95-e07263b6e64a" />

A clicked lesson needs a page to open, and the milestone needs one browser test of the loop: finish lessons, meet the goal, see the streak, find the lessons again. This issue adds a stub lesson page and these Playwright tests. The next milestone replaces the stub with the real lesson page and deletes `LESSON_STUB`.

**Needs:** #82 (the finish route), #86 and #87 (the pages to test), #84 (lessons to click on).
**Unblocks:** #97.

## What to do

- Stub page `/learn/[lang]/lessons/[id]`:
  - Shows title, summary, level, kind, status, best score, and "The lesson itself arrives in the next milestone."
  - No course or no level: redirect to `/onboarding?lang={lang}`, as the course home does (#52). Unknown id: the 404 page.
- "Finish with score" client form on that page:
  - The server component reads `process.env.LESSON_STUB` at request time and passes `process.env.LESSON_STUB === 'true'` (the same test as `LessonStubGuard`). The form is absent when it is false.
  - Not a `NEXT_PUBLIC_` variable, because the same image serves CI and the deploy.
  - Sends `{ score }` with `clientPut` (`apps/web/lib/api-client.ts`) to `PUT /api/courses/:lang/lessons/:id/result`, then returns to `/learn/[lang]`.
  - Disabled while pending, like `GoalPicker`.
- `compose.yml`: `${LESSON_STUB:-true}` for web.
- `apiFind` in `apps/web/lib/api.ts`: like `apiGet`, but a 404 returns `{ status: 'not-found' }` so the page can call `notFound()`. Every other non-2xx stays unavailable. Existing callers do not change. Test it in `api.test.ts`.
  - Typed: `apiFind<S extends z.ZodType>(schema: S, apiPath: string, urlParams?: Record<string, string>): Promise<FindResult<z.infer<S>>>`

  > ⚠️ **To check:** `apiFind` and `FindResult` are already on main (`apps/web/lib/api.ts`, since PR #104), with this signature. This step may be done. Check before implementing.

  **Types** (cards on the [lessons data model](https://victorbro.github.io/ft_transcendence/milestone2-data-model.html)): [`LessonCard`](https://victorbro.github.io/ft_transcendence/milestone2-data-model.html#LessonCard) · [`FinishLesson`](https://victorbro.github.io/ft_transcendence/milestone2-data-model.html#FinishLesson) · [`LessonId`](https://victorbro.github.io/ft_transcendence/milestone2-data-model.html#LessonId) · [`FindResult`](https://victorbro.github.io/ft_transcendence/milestone2-data-model.html#FindResult)
- Playwright specs on `freshLearner` onboarded to French at A0, so the course is A1 (or #53's fixture, if it has landed):

| Case | Do | Expect |
|---|---|---|
| Goal 10 | Finish the proposed lesson at 80. | Before: one proposed, three extra. After: "Daily goal reached" and "1 day streak. Today counts." |
| Goal 30 | Finish a lesson at 40. | Failed, and it counts: 1 of 3. |
| Goal 60 | Open the page. | Six proposed. Check only the count: a streak check at 60 could cross midnight. |
| Two tabs | Two browser contexts, one account, goal 30: finish the 2nd and 3rd lessons at the same time. | Goal met once, streak 1. |
| All lessons | Filter to Done, open page 2 by URL, disable JavaScript. | The finished lesson shows, page 2 opens, the list still renders. |

- Add the two new routes to `PAGE_ROUTES` in `e2e/support/routes.ts` with `onboarded: true` (#52 added the flag and the `onboarded` fixture). That puts them under the console gate and the footer check as a placed learner. The daily goal page is already there.
- Swap the e2e fixture languages in `e2e/support/session.ts`: `ONBOARDED_COURSE` becomes French A1, the level #84 guarantees lessons for, and `SECOND_COURSE` German. Otherwise the gate visits the new routes as a German B1 learner, whose lessons only exist after #91, and the lesson page 404s. Update the specs that hardcode the old languages (`course.spec.ts`, `landing.spec.ts`).

## Examples

<details><summary>Example: the stub lesson page for the example learner at the end of 2026-10-12, with LESSON_STUB on</summary>

```text
/learn/fr/lessons/fr-definite-articles

Le, la, les
Choisir le bon article défini selon le genre et le nombre.

Level        A1
Kind         Grammar: Nouns and determiners
Status       Failed
Best score   55%

The lesson itself arrives in the next milestone.

Score [ 80  ]   [ Finish with score ]
```

</details>

## Done when

- [ ] Every spec above is green, with zero retries.
- [ ] An unknown id renders the 404 page, not the error boundary.
- [ ] With `LESSON_STUB` unset, the form is absent.
- [ ] The console gate and the footer check cover the placed daily goal page and both new routes.
- [ ] The console gate opens a seeded French A1 lesson as `onboarded`.

## Not in this issue

- The lesson page itself.
