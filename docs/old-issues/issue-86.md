# #86: feat(web): the daily goal page

> Text of [issue #86](https://github.com/VictorBro/ft_transcendence/issues/86) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

<img width="2560" height="2200" alt="Image" src="https://github.com/user-attachments/assets/84299409-6ec7-4292-bd97-3fbf49225d3d" />

<img width="2560" height="1920" alt="Image" src="https://github.com/user-attachments/assets/aa8fce35-ec14-496a-86e7-ab9fb23967e4" />

`/learn/[lang]` becomes the daily goal page: today's lessons, extra lessons, the streak, level progress, and the level picker. It replaces the `roadmapSoon` placeholder.

**Needs:** #81 (the `GET today` data), #82 (finished lessons), #84 (lessons on the dev stack), #85 (learners that show every state).
**Unblocks:** #96, #97.

## What to do

- In `apps/web/app/[locale]/(dashboard)/learn/[lang]/page.tsx` (server component): keep the course lookup and #52's guard (a missing or unplaced course never reaches this page), then call `GET /api/courses/:lang/today` once.
- Lesson titles and summaries stay in the course language, like placement questions. The rest of the page is in the interface language.
- What the page shows in each state:

| State | Page shows |
|---|---|
| No course or no level | Never shown: #52 redirects to `/onboarding?lang={lang}`. |
| No lessons seeded for the level | "Lessons for B2 are not ready yet." |
| Goal not met | Today card: done rows, then proposed rows. Extra lessons under "Want more?". |
| Goal met | "Daily goal reached", done rows only. Extra lessons under "Keep going". |
| Goal raised after it was met | done / new target, with the missing lessons proposed. The streak line still says "Today counts". |
| Level complete | The level complete card above the Today card. |

- Streak line (ICU plurals): "4 day streak. Reach today's goal to keep it.", "5 day streak. Today counts.", "Reach today's goal to start a streak."
- Today card:
  - "60 min goal: 2 of 6 lessons" and a bar that stops at full. The bar is a new `ProgressBar` in `packages/ui` (#97 reuses it).
  - Done rows, in finish order: a check and the best score, or "Failed, best 40%: counts today". A level badge on a lesson from another level.
  - Proposed rows: number, title, summary, "10 min". The first is "Next up" and has the only filled button.
- Extra lessons: three rows. Hide the section when empty.
- Link "See all 150 A2 lessons" to `/learn/[lang]/lessons`.
- Level complete card:
  - Only when every lesson of the level is attempted AND at least 80% are passed.
  - "You finished A2: 150 of 150 attempted, 128 passed, 120 needed.", a primary "Start B1" button that calls `setCourseLevel` (`apps/web/lib/courses-client.ts`), and "Retake the placement test".
  - At C2: "You finished C2, the top level." and no button.
- "This course" aside:
  - Replace the static level with a `LevelPicker`, a twin of `GoalPicker`. The level changes here, next to the goal, because both are course settings.
  - Then the goal picker, level progress ("Attempted 230 of 250", "Passed 190 of 250, 200 needed"), the best streak and the placement link.
- Lesson links use `prefetch={false}`, as in `practice-row.tsx`. The lesson route comes with #96, so until then a link opens the 404 page.
- `Course` messages in en/fr/de. Remove `roadmapSoon` from all three. Topic, theme and kind labels belong to #87.
- #97 later adds the rank, the challenge and "New today" here.
- The page passes the phone layout gate (`e2e/tests/layout.spec.ts`).

## Examples

<details><summary>Example: the daily page, goal not met</summary>

A French course at A1, goal 30 (target 3), on the learner's first day: one lesson passed, one failed, so 2 of 3 count.

```text
French

Reach today's goal to start a streak.

+-- Today -------------------------------------------------+
| 30 min goal: 2 of 3 lessons                              |
| [#############.......]                                   |
|                                                          |
| [v] Saluer et dire au revoir                    85%      |
|     Le, la, les      Failed, best 40%: counts today      |
|                                                          |
| Next up                                                  |
| 3  Le présent des verbes en -er                 10 min   |
|    Les terminaisons du présent avec parler,  [ Start ]   |
|    habiter et aimer.                                     |
+----------------------------------------------------------+

Want more?
  4  Au café : les boissons                     10 min
  5  Lire une invitation                        10 min
  6  Les nombres de 0 à 20                      10 min

See all 120 A1 lessons

+-- This course -------------------------------------------+
| Level        [ A1      v ]                               |
| Daily goal   [ 30 min  v ]                               |
| Attempted 2 of 120                                       |
| Passed 1 of 120, 96 needed                               |
| Best streak: 0 days                                      |
| Retake the placement test                                |
+----------------------------------------------------------+
```

</details>

<details><summary>Example: the level complete card</summary>

```text
+----------------------------------------------------------+
| You finished A1: 120 of 120 attempted, 104 passed,       |
| 96 needed.                                               |
|                                                          |
| [ Start A2 ]   Retake the placement test                 |
+----------------------------------------------------------+
```

</details>

## Done when

- [ ] By hand on the dev stack (the seed creates the #85 learners), each state renders, with a screenshot of each in the PR:
  - French A1: `demo.eva` the level complete card, `demo.chloe` a broken streak and a failed lesson counting today, `demo.ben` "Reach today's goal to keep it".
  - `demo.felix`'s English course (no level): opening it lands on onboarding step 2. `demo.eva`'s German A2: "not ready yet".
  - Other states: finish lessons through `/api/docs` (`LESSON_STUB` is on there).
- [ ] The level picker writes through `PATCH /api/courses/:lang/level`. The page then shows the new level's proposal, and the old progress is kept.
- [ ] "Start B1" appears only when both parts of the level complete rule hold.
- [ ] View source shows the proposal: the page renders without JavaScript.
- [ ] `messages.test.ts` passes.

## Not in this issue

- The lesson page.
- A streak calendar or "days met this week": there is no day history.


