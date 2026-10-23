# #87: feat(web): the all lessons page, with advanced search

> Text of [issue #87](https://github.com/VictorBro/ft_transcendence/issues/87) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

<img width="2560" height="3100" alt="Image" src="https://github.com/user-attachments/assets/fac630a8-9152-4e59-8b3e-ac82005aef4a" />

`/learn/[lang]/lessons` lists every lesson of the current level (120 to 320), with search, filters, sorting, groups and pages. This is the Advanced search module (subject minor: filters, sorting, pagination), on top of the search in #81.

**Needs:** #81 (`GET lessons` and its search), #84 (lessons on the dev stack), #85 (learners with history).
**Unblocks:** #96.

## What to do

- Add the route as a server component that renders from `searchParams`: the course home's lookup (`loadCourses`, `findCourse`), then one `GET /api/courses/:lang/lessons` when a level is set.
- What the page shows in each state:

| State | Page shows |
|---|---|
| No course in `:lang`, or no level | Redirect to `/onboarding?lang={lang}`, as the course home does (#52). An invalid language is a 404. |
| `levelTotal` is 0 | "Lessons for B2 are not ready yet." (as on #86), and no form. |
| No lesson matches | An empty state with Clear filters. |
| Lessons match | The form, the rows with group headers, the page links. |

- A plain GET form, so every state is a URL: back and refresh restore it, and it works with JavaScript off (also evidence for the SSR module).
  - Fields: search; status (Not started, Failed, Done); kind; topic and theme as checkbox groups; sort (Order, Score, Last finished) and direction; group (None, Status, Day, Kind); Apply; Clear filters.
  - No `page` field, so Apply always opens page 1. Only the page links set `page`.
- Parse `searchParams` with the shared `LessonQuerySchema`. Its fields fall back to their defaults, so the form shows exactly what the API applied, and a hand-edited URL never reaches the error boundary. Join repeated checkbox params into the comma lists the API takes.
- Row: "#3 Le présent des verbes en -er", the summary, kind with topic or theme, a status badge, the best score, and the last finished day.
  - Format that day with `timeZone: 'UTC'`, because it is a calendar date.
  - The whole row links to the lesson, `prefetch={false}`. The lesson route comes with #96, so until then a link opens the 404 page.
- Group headers, before the first row of each page and wherever the group changes:
  - Status: Failed / Not started / Done.
  - Day: Today / Yesterday / a date / Not started. Compare each row's `day` with the page's `day` (the course day).
  - Kind: the kind.
- Paging: numbered links that keep the other params, previous, next, and "21 to 40 of 250".
- No level control. Only a link to `/learn/[lang]`: "Change your level in This course" (where #86 puts the level picker).
- Messages in en/fr/de: `Lessons`, `Topics` (the 13 grammar topics), `Themes` (the 14 themes) and the kind labels.
- #52 guards only the course home, not the pages below it, so this page applies the same check itself (the row above).

## Examples

<details><summary>Example: done lessons by day, best score first</summary>

The example learner at the end of 2026-10-12, the course day (French A1). Four lessons are done, so one page.

```text
/learn/fr/lessons?status=done&sort=score&dir=desc&group=day

All A1 lessons
Search [                  ]  Status [ Done  v ]  Kind [ All v ]
Topics  [ ] Nouns and determiners  [ ] Verb forms  ...
Themes  [ ] Personal identification  [ ] Food and drink  ...
Sort [ Score v ] [ Descending v ]   Group [ Day v ]
[ Apply ]  Clear filters

Today
  #5 Lire une invitation                          Done   85%
     Trouver le jour, l'heure et le lieu dans une courte invitation.
     Reading: Free time                         Oct 12, 2026
  #3 Le présent des verbes en -er                 Done   80%
     Les terminaisons du présent avec parler, habiter et aimer.
     Grammar: Verb forms                        Oct 12, 2026
Yesterday
  #1 Saluer et dire au revoir                     Done   90%
     Dire bonjour et au revoir, à un ami ou à un inconnu.
     Functions: Personal identification         Oct 11, 2026
Oct 10, 2026
  #4 Au café : les boissons                       Done   80%
     Les noms des boissons courantes, avec leur article.
     Vocabulary: Food and drink                 Oct 10, 2026

1 to 4 of 4
Change your level in This course
```

</details>

## Done when

- [ ] A direct load of `?status=failed&kind=grammar&sort=score&dir=desc&page=2` renders exactly that view.
- [ ] By hand on the dev stack, as `demo.ben` on French A1: every group and sort shows sensible rows, and `group=day` has Today, Yesterday and older dates.
- [ ] `?sort=foo&page=0` renders the default view.
- [ ] With JavaScript disabled, the form still filters, sorts and pages.
- [ ] On French A1, a search typed without accents finds a title that has them, in any interface language.
- [ ] On German A1, `maedchen` finds `Mädchen`, in any interface language.
- [ ] `messages.test.ts` passes.

## Not in this issue

- Search across levels.
- Infinite scroll.


