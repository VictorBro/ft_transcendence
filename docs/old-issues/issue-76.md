# #76: docs: record the lesson, daily goal and streak decisions

> Text of [issue #76](https://github.com/VictorBro/ft_transcendence/issues/76) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

`docs/PRODUCT_ARCHITECTURE.md` still describes an old design: locked topic tiles, a `Topic` table, a `Lesson` row that is both the roadmap and the run, and a streak counted in `DailyStat.minutesActive`. We are not building any of it. This issue updates the docs to match what we build, and adds `docs/LESSONS.md`, the guide for writing all the lessons (about 4,000).

**Needs:** nothing.
**Unblocks:** #83, #105, #88, #89, #90 (they cite `docs/LESSONS.md`, so they cannot merge before it exists).

## What to do

### 1. Write down the decisions

Put each one where an implementer will read it, mostly in `docs/PRODUCT_ARCHITECTURE.md`.

1. **No locks.** The order only decides which lessons are proposed. The learner can open any lesson of the course language, and every finish counts.
2. **The catalogue is `Lesson`**, seeded from `content/lessons`.
   - Fields: `id` (the primary key, a readable authored key such as `de-separable-verbs`), lang, level, position, kind, a grammar `topic` or a `theme`, a title and a summary for the learner, and a brief for the tutor. The learner never sees the brief.
   - **One language per lesson:** the whole lesson, and its outline line, is in the course language, like a question in the bank.
   - Every language has the same count per level (table below).
3. **One `LessonResult` per (course, lesson):** best score, the day of the latest finish, `finishedAt`. No history.
   - No row: not started. Best >= 70: done. Anything else: failed.
   - The next milestone's exercises attach to this row. A redo replaces them.
   - `LessonResult` is keyed by its pair, and `Lesson` by its authored id. Say so next to the sentence "Everything is UUID-keyed".
4. **The goal counts lessons.** 10 / 30 / 60 minutes = 1 / 3 / 6 ten-minute lessons finished that day, pass or fail, from any list. Nothing tracks minutes, and `DailyStat` is not built.
5. **The streak is three columns on `UserLevel`:** `streak`, `bestStreak`, `lastGoalDay`.
   - It moves when the day's goal becomes met: by a finish, or by lowering the goal.
   - Raising the goal never un-meets a day. So lowering and raising the goal again banks a day. We accept that.
   - A finish that arrives after local midnight counts for the new day.
   - No day history: `lastGoalDay` is the only stored day.
6. **A level is complete** when every lesson was attempted and at least 80% are passed. Switching level keeps all progress.
7. **The day is the learner's**, from `User.timeZone`. A course's day never goes backwards: never before its last met day or its newest result.
8. **The API stays language-neutral:** no `locale` parameter. A lesson has one language, so the response is the same for every interface language.
9. **Advanced search is the all lessons page:** numbered pages of 20 in the URL, filtered and sorted in memory over the current level.
10. **Finishing** goes through `PUT .../lessons/:id/result`, reachable only behind `LESSON_STUB` until the lesson page ships.
11. **Gamification is claimed** with XP and ranks, a daily challenge and achievements, per course (#94, #95, #97). A streak alone is not one of the subject's items (see the Gamification line in `docs/SUBJECT_SUMMARY.md`). We ask staff to confirm that it counts outside a game.
12. **Multi-user proof** (the "Multi-user simultaneous support" paragraph): a row lock on the course around finishing and goal changes, `LessonResult`'s primary key, and an e2e test with two browser contexts.

### 2. Fix the other doc lines

- `docs/PRODUCT_ARCHITECTURE.md`, lines 18-19, 26, 28, 44, 157-168, 179-185, 262-264, 305, 347, 473, 490, 522, 541, 579, 610, 614, 656-659, 665, 668-670, 699, 702, 710-711, 718, 728, 732-734, 770, 776-778, 784, 791.
  - `enum Topic` already exists in `schema.prisma`, and "topic" now means one of the 13 grammar categories. So there is no `model Topic`.
  - Explanation and exercise caches key on the lesson id, not the topic. Whether they also key on the interface language is for the lesson page milestone to decide.
  - `DocumentChunk` drops `topicId` for `level`, `topic?` and `theme?`. One grammar note per (level, topic) cell, shared by its lessons.
- `README.md` lines 9 and 18 (the "roadmap of topics").
- `docs/TECHNICAL_PLAN.md:74`: there is no content CRUD.
- `docs/ITEM_BANK.md:154`: topic now labels grammar lessons only.

### 3. Write `docs/LESSONS.md`, the authoring guide

Sections:

- What a lesson is.
- Counts per level and per kind (the table below, and the `KIND_COUNTS` tables in #77).
  - The counts are exact (`LESSONS_PER_LEVEL` and `KIND_COUNTS`). Changing a level's count is a PR to both constants, for all three languages, inside the allowed range.
- The outline format and the id rules: the language and a few English words, no level, so a lesson can move level.
- Moving a lesson, in one PR:
  - move its outline entry and its lesson to the other level's files, with the same id;
  - move one lesson of the same kind back, so every count stays exact;
  - the seed updates `level` and `position`, and results stay attached.
- A generator section, left empty. #83 writes it: running it, regenerating a lesson or a level, the cost.
- The automated checks.
- How to read the full outline, and how to review a sample of lessons.
- The copyright rule: write from the CEFR descriptors and the model's knowledge. Never copy text from a published inventory, word list, course or test.
- An id on `main` is permanent, because results attach to it.

<details><summary>Example: an outline line and the lesson it becomes</summary>

Entry 2 of `content/outlines/fr-a1.json`, so position 2 of French A1:

```json
{ "id": "fr-definite-articles", "kind": "grammar", "topic": "nouns_and_determiners", "workingTitle": "Le, la, les", "intent": "Choisir l'article défini selon le genre et le nombre du nom." }
```

The lesson it becomes in `content/lessons/fr-a1.json`: the same id, kind and topic, then the title, the summary and the brief, all in French. The entry has no lang, level or position: the seed adds them.

```json
{
  "id": "fr-definite-articles",
  "kind": "grammar",
  "topic": "nouns_and_determiners",
  "title": "Le, la, les",
  "summary": "Choisir le bon article défini selon le genre et le nombre.",
  "brief": {
    "objective": "Choisir l'article défini le, la, l' ou les devant un nom.",
    "points": [
      "Le devant un nom masculin, la devant un nom féminin : le livre, la table.",
      "L' devant une voyelle ou un h muet : l'ami, l'école, l'hôtel.",
      "Les au pluriel, pour les deux genres : les livres, les tables."
    ],
    "examples": [
      "Le café est chaud.",
      "La maison est grande.",
      "L'école est fermée le dimanche.",
      "Les enfants jouent dans le parc."
    ],
    "pitfalls": [
      "Erreur : oublier l'élision (*le ami* au lieu de l'ami).",
      "Erreur : deviner le genre. Il faut apprendre chaque nom avec son article."
    ]
  }
}
```

</details>

**Lessons per level**, the same for de, en and fr (1,330 per language, about 4,000 in all):

| Level | Lessons | Allowed range |
|---|---|---|
| A1 | 120 | 100 to 140 |
| A2 | 150 | 130 to 180 |
| B1 | 230 | 200 to 270 |
| B2 | 250 | 210 to 300 |
| C1 | 260 | 220 to 320 |
| C2 | 320 | 260 to 400 |

**Lessons per kind**, exact and per language: #77 has them as `KIND_COUNTS[lang][level]`, one table for German and French and one for English. German and French have more grammar at A1 to B1, English more vocabulary at B1 to C2.

## Done when

- [ ] No doc still describes topic tiles, locks, `model Topic`, `DailyStat`, `minutesActive` or an enrollment table as planned. A line saying one is not built is fine.
- [ ] Each decision above is written where an implementer will read it.
- [ ] Someone who has not read this issue can write an outline and review a level from `docs/LESSONS.md` alone. (#83 does the same for running the generator.)
- [ ] The Gamification and Advanced search rows (lines 262-264 and 732-734) match what ships.
- [ ] `make ci` green.

## Not in this issue

- Placement's result, lines 60 and 147 of `docs/PRODUCT_ARCHITECTURE.md`: #71 stores one level above the highest passed, capped at C2, so this issue rewrites both lines.



