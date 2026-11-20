# Lessons: content, seeding and play

What a lesson is, how many there are, how they are planned, written, checked and seeded, how a
learner plays one, and how an attempt is scored. [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md)
says how the daily goal and the all lessons page use them, and
[ARCHITECTURE.md](ARCHITECTURE.md) §5 traces the routes. Why the lesson model is the one of the
lesson prototype is in [#137](https://github.com/VictorBro/ft_transcendence/issues/137).

Audience: whoever writes an outline, runs the authoring kit, checks a level, or needs to explain the
lesson loop at evaluation.

---

## 0. Four words that are easy to mix up

| Term | What it is | Where it lives | How many today |
|---|---|---|---|
| **Outline entry** | The plan of one lesson: id, kind, topic or theme, working title, intent | `content/outlines/<lang>-<level>.json`, committed | 3,990 (1,330 per language) |
| **Authored lesson** | The lesson's files: a brief, plus a content file for every kind but vocabulary | `content/briefs/<id>.json`, `content/lessons/<id>.json`, committed | 216 briefs, 108 content files |
| **Seeded lesson** | One `Lesson` row per outline entry, written by `db:seed` | Postgres | 3,990: every entry, authored or not |
| **Ready lesson** | A seeded lesson whose files exist and pass `validateLesson`: `Lesson.ready = true` | Postgres | 216: the first 12 by position of each of the 18 language and level pairs |

**Everything under `content/` is written offline and committed.** The seed only reads it. No
lesson, brief or outline is generated at runtime, at deploy time or inside the tooling image: the
image carries the files (§4), and the seed copies them into the database. The only LLM call a
learner causes in a lesson is the discussion (§12), and it changes nothing that is stored.

---

## 1. What a lesson is

A lesson is one row of a **seeded catalogue**. Its plan is an outline entry and its body is one or
two JSON files, all committed to the repo and loaded by `db:seed`.

| Kind | What it teaches | Classified by |
|---|---|---|
| `grammar` | One grammar point, for example the definite articles | `topic` |
| `vocabulary` | A set of words on one theme, for example drinks at the café | `theme` |
| `functions` | One thing to do with the language, for example greeting or making an appointment | `theme` |
| `reading` | Understanding one kind of short text, for example an invitation | `theme` |

A grammar lesson has a `topic` and no `theme`. The other three kinds have a `theme` and no
`topic`. Never both, never neither.

**Topics** (13), the grammar categories the question bank already uses
([ITEM_BANK.md](ITEM_BANK.md) §4):

```
nouns_and_determiners      pronouns                  verbs_morphology
verb_usage                 syntax_and_sentence_structure
subordinate_clauses        prepositions_and_case     adjectives
adverbs                    agreement                 negation
comparison_and_quantity    information_structure_and_pragmatics
```

**Themes** (14), the Council of Europe Threshold Level themes. Its German, English and French
versions keep the same themes, so one list serves de, en and fr:

```
personal_identification    house_and_home    daily_life      free_time
travel                     relations         health          education
shopping                   food_and_drink    services        places
language                   weather
```

**The lesson model** is the one of the lesson prototype
([lesson_prototype](https://github.com/bastian-schnitzler/lesson_prototype), `schemaVersion: 2`,
frozen at commit `928484d`). A lesson is complete and playable: what to teach, the exercises, their
answer keys, an exam and how it is scored. Its schemas and validators are in `@ft/shared`, under
`packages/shared/src/lessons/` (#135, #136), exported as the namespace `lessons`.

- **The brief** (`content/briefs/<id>.json`, every kind) holds the plan of the lesson: the title,
  the objective, the words, rules, expressions or documents, and the exam.
- **The content** (`content/lessons/<id>.json`, every kind except vocabulary) holds the lesson as
  the learner plays it: steps, pages and items. A vocabulary lesson has no content file: its
  lesson is derived from its brief.
- Both start with the same envelope: `schemaVersion`, `id`, `kind`, `lang`, `level`, `locales`,
  `title`, `objective`, `estimatedMinutes` and `provenance`.

**Languages in a lesson.** What is learned (words, sentences, texts, answers) is in the course
language. The help around it (the objective, instructions, translations) is in English, French and
German, so the lesson works for every interface language. Which of the three the player uses is the
mother tongue rule (§11).

**What the learner sees before opening it.** The title, in the course language, and a summary: the
objective in the course language. Both appear on the daily goal page and the all lessons page, and
the text search matches them. A title is at most 80 characters and a summary at most 200.

**How long a lesson takes.** The daily goal counts lessons: 10, 30 or 60 minutes means 1, 3 or 6
lessons finished that day (`LESSON_MINUTES = 10`). The ready lessons are planned longer than that:
their `estimatedMinutes` run from 8 to 37, with a median of 18. Whether the goal keeps counting
lessons or the kit keeps lessons nearer ten minutes is still open for the team
([PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.3).

---

## 2. Counts per level and per kind

The outlines are the same size for de, en and fr: 1,330 entries per language, 3,990 in all.

| Level | Lessons | Allowed range |
|---|---|---|
| A1 | 120 | 100 to 140 |
| A2 | 150 | 130 to 180 |
| B1 | 230 | 200 to 270 |
| B2 | 250 | 210 to 300 |
| C1 | 260 | 220 to 320 |
| C2 | 320 | 260 to 400 |

The counts are exact: they live in `LESSONS_PER_LEVEL` (`packages/shared/src/schemas/lesson.ts`)
and CI rejects an outline with one entry more or less. To change a count, open a PR that changes
the constant and `KIND_COUNTS` with it, for all three languages at once, and stays inside the
allowed range. Every language keeps the same count: the differences go in the counts per kind.

**Lessons per kind**, from `KIND_COUNTS[lang][level]`. German and French have more grammar at A1
to B1, English more vocabulary at B1 to C2.

German and French:

| Level | Grammar | Vocabulary | Functions | Reading |
|---|---|---|---|---|
| A1 | 48 | 48 | 14 | 10 |
| A2 | 60 | 52 | 18 | 20 |
| B1 | 68 | 100 | 22 | 40 |
| B2 | 50 | 125 | 30 | 45 |
| C1 | 26 | 130 | 32 | 72 |
| C2 | 26 | 166 | 32 | 96 |

English:

| Level | Grammar | Vocabulary | Functions | Reading |
|---|---|---|---|---|
| A1 | 42 | 54 | 14 | 10 |
| A2 | 50 | 60 | 20 | 20 |
| B1 | 46 | 122 | 22 | 40 |
| B2 | 38 | 136 | 30 | 46 |
| C1 | 14 | 142 | 30 | 74 |
| C2 | 16 | 182 | 32 | 90 |

These counts are exact too: CI requires each kind's count, with no tolerance. Every kind exists at
every level of the outlines.

### What is ready today

12 lessons per language and level are written, the first 12 entries of each outline: 18 × 12 =
**216 ready lessons**. Ready lessons always form the head of their outline, with no gap (a check of
§8 enforces it), so "the next lesson to write" is always the 13th, then the 14th.

| | Vocabulary | Grammar | Functions | Reading | All |
|---|---|---|---|---|---|
| Ready, all 18 levels | 108 | 61 | 26 | 21 | 216 |

The mix per level follows each outline's order, not `KIND_COUNTS`. All 18 levels have ready
vocabulary and grammar lessons, 16 have functions (not en C1 or fr C2) and 13 have reading (not
de A1, en A1, fr A1, fr C1 or fr C2). A daily challenge that asks for a kind is only drawn when the
level has a ready lesson of that kind (#95).

**French A1**, the demo level and the one every e2e test onboards into: ten lessons were copied from
the lesson prototype (`lesson_prototype` at `c806f47`), and two functions lessons,
`fr-introducing-yourself` and `fr-thanking-and-apologising`, were written with the prototype's
functions authoring tool (bastian-schnitzler/lesson_prototype#121). All twelve landed in PR #171
(#84). The other 17 levels were written with the authoring kit of §7 (#91 to #93).

### Where the counts come from

Three angles, each estimated per level, then reconciled and rounded to tens:

| Angle | What it counts | Weight |
|---|---|---|
| Inventories | The published grammar, vocabulary, function and text-type lists per level, at about 3 grammar statements or 12 to 15 new words per lesson | About a third |
| Hours | The guided learning hours per level from the language institutions, with about 22% of that time in ten-minute new-content lessons. Every source is official, and it is the only angle that reaches C2 | About half |
| Apps and course books | Busuu, Duolingo, Lingoda and Cosmopolite, which flatten at the top and stop before C2 | About a fifth |

- All three land at 120 to 130 for A1.
- The big jump is from A2 to B1. B2 to C1 is nearly flat. C2 is extrapolated.

Key sources:

- Cambridge English, guided learning hours:
  https://support.cambridgeenglish.org/hc/en-gb/articles/202838506-Guided-learning-hours
- LanguageCert, guided learning hours per level: https://www.languagecert.org/en/guided-learning-hours
- Busuu, 99 French A1 lessons in about 25 hours: https://www.busuu.com/en/languages/how-long-learn-language
- Duolingo, about 800 words at A1 and at A2: https://blog.duolingo.com/how-are-duolingo-courses-evolving
- English Vocabulary Profile, new words per level (Capel 2010):
  https://www.cambridge.org/core/journals/english-profile-journal/article/a1b2-vocabulary-insights-and-issues-arising-from-the-english-profile-wordlists-project/E57847F6C5574124B2354F9BEEC005FA
- Goethe-Zertifikat B1 word list: https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf
- British Council and EAQUALS Core Inventory for General English:
  https://www.eaquals.org/wp-content/uploads/EAQUALS_British_Council_Core_Curriculum_April2011.pdf
- Inventaire linguistique des contenus clés des niveaux du CECRL:
  https://www.eaquals.org/wp-content/uploads/Inventaire_ONLINE_full.pdf

---

## 3. The outlines

One outline per language and level, `content/outlines/<lang>-<level>.json`: the ordered plan of
the level. File names are lowercase (`fr-a1.json`) and must match the `lang` and `level` inside,
where the level is uppercase:

```json
{ "lang": "fr", "level": "A1", "entries": [ ... ] }
```

An **entry** is `{ id, kind, topic?, theme?, workingTitle, intent }`. The working title and the
intent are one line each, in the course language. An entry has no `lang`, `level` or `position`:
the seed adds them. **The position is the entry's place in the file**, from 1. The order matters:
no lesson is locked, but the daily goal proposes the lowest ready lessons not yet passed, so the
order is the course a learner follows, and the head of each outline is what gets written first.

Entry 2 of `content/outlines/fr-a1.json`, so position 2 of French A1:

```json
{ "id": "fr-subject-pronouns", "kind": "grammar", "topic": "pronouns", "workingTitle": "Les pronoms je, tu, il, elle…", "intent": "Employer les pronoms sujets je, tu, il, elle, on, nous, vous, ils et elles, choisir tu ou vous selon la personne, ils ou elles selon le groupe, et on pour dire nous à l'oral." }
```

**Before its files exist**, its `Lesson` row has `title` = the working title, `summary` = the
intent, an empty brief, no content and `ready = false`
([#134](https://github.com/VictorBro/ft_transcendence/issues/134)). So every level is listed and
searchable from day one, and the all lessons page shows those rows as "Coming soon". Only a ready
lesson (§4) can be played.

**Writing an outline:**

- Exactly the level's count, with the counts per kind of §2.
- One focus per lesson.
- Each lesson builds on the ones before it, and on the levels below.
- No two entries teach the same thing, across all six levels of the language.
- An LLM may write the first draft. A fluent speaker then reads every entry (§8).

**With Claude Code:** `/outline-language <lang>`, for example `/outline-language es`, writes the
first draft of a language's six outlines the way English and German were written. It researches
the language's level inventories and exams, plans every entry across the six levels at once,
orders each level, has each level reviewed twice (curriculum and native speaker), and checks that
every lesson has one focus. It asks first for the standard variety, the title conventions per
kind and the readers, and leaves the reading in §8 to people. The language must already be in
`LEARNABLE_LANGUAGES` and `KIND_COUNTS`. The instructions are in
`.claude/skills/outline-language/SKILL.md`, the steps in `.claude/workflows/outline-language.js`.

**Reading a whole outline.** The JSON is hard to read in order, so print one line per entry:
position, kind, topic or theme, working title. Read it top to bottom as the course a learner
follows, and check the counts per kind against §2:

```bash
jq -r '.entries | to_entries[] | "\(.key + 1)\t\(.value.kind)\t\(.value.topic // .value.theme)\t\(.value.workingTitle)"' content/outlines/fr-a1.json
jq -r '.entries | group_by(.kind)[] | "\(.[0].kind)\t\(length)"' content/outlines/fr-a1.json
```

---

## 4. The lesson files, the seed and the ready flag

| File | Kinds | Holds |
|---|---|---|
| `content/briefs/<id>.json` | all four | The envelope and the plan of the lesson |
| `content/lessons/<id>.json` | grammar, functions, reading | The envelope and the lesson as played: steps, pages, items |

The `id`, `kind`, `lang`, `level` and `topic` or `theme` of both files must match the outline
entry, and the content file repeats the brief's `title` and `objective` word for word.

### What the seed does

`db:seed` (`apps/api/prisma/seed.ts`) runs after every migration: `make`, `make seed`, and the
`migrate` service of a deployment ([DEPLOYMENT.md](DEPLOYMENT.md) §5). For lessons, `seedLessons`:

1. Reads every outline and builds one row per entry, with its position, title = working title,
   summary = intent, brief `{}`, content null and `ready = false`. A duplicate id stops the seed.
2. Lists `content/briefs/` and `content/lessons/`. A file that no entry plans, or a content file
   without a brief, stops the seed.
3. Runs `validateLesson` on each brief, with its content file when the kind has one. **An invalid
   lesson stops the seed**, naming the id and every issue: a broken file fails loudly, it never
   becomes a row that is quietly not ready. A valid one sets the row's title to the envelope's
   title, its summary to the objective in the course language, its `brief` and `content` to the
   parsed files, and `ready = true`.
4. Refuses to run if the database holds a lesson that no outline has (spec fixtures with a
   `<lang>-test-` id excepted): a shipped lesson is edited or moved, never deleted.
5. Writes only the rows that changed, in one transaction. A row whose brief or content changed
   also loses its unfinished attempts in the same transaction, since their pages and answers point
   into the old lesson. Finished attempts and results stay.

It prints `seeded N lessons`, where N counts new or changed rows only, so a second run prints 0.

### What `ready` means

`Lesson.ready` is set on every run, from the files alone. A lesson becomes ready by adding its files
and reseeding, and stops being ready when they are removed: no migration, and no row deleted.

| Reads | Uses |
|---|---|
| The daily proposal and the level's progress (`plan()`, `levelProgress()` in `roadmap.rules.ts`) | Ready lessons only. A French A1 course has `progress.total` 12, and 10 passed lessons (80%) complete it |
| The attempt routes and the discussion (§10, §12) | Ready lessons only: anything else is 404 `lesson.notFound` |
| The all lessons page and `GET lessons` | Every row. A row that is not ready has the status `soon` and shows "Coming soon" |
| The daily challenge (#95) | A kind challenge only when the level has a ready lesson of that kind |

The brief of `fr-subject-pronouns`, shortened:

```json
{
  "schemaVersion": 2,
  "id": "fr-subject-pronouns",
  "kind": "grammar",
  "lang": "fr",
  "level": "A1",
  "locales": ["en", "fr", "de"],
  "title": "Les pronoms je, tu, il, elle…",
  "objective": {
    "en": "Use the French subject pronouns je, tu, il, elle, on, nous, vous, ils and elles.",
    "fr": "Employer les pronoms sujets je, tu, il, elle, on, nous, vous, ils et elles.",
    "de": "Die französischen Subjektpronomen je, tu, il, elle, on, nous, vous, ils und elles verwenden."
  },
  "estimatedMinutes": 15,
  "provenance": { "generator": "…", "model": "…", "promptVersion": "…", "generatedAt": "…", "inputHashes": { "outline": "…" } },
  "topic": "pronouns",
  "rules": ["…"],
  "blocks": ["…"],
  "exam": { "…": "…" },
  "scoring": { "practiceWeight": 35, "examWeight": 65, "orthographyCredit": 0.5 }
}
```

The full shape of each kind is in the schemas of `packages/shared/src/lessons/schemas/`, and card by
card in [milestone2-data-model.html](milestone2-data-model.html#files).

### Who carries the files where

| Moment | What happens to `content/` |
|---|---|
| Authoring, on a member's machine | The kit of §7 writes `briefs/` and `lessons/`; people write `outlines/` and `items/`. Everything is committed |
| CI | The specs of §8 validate every file |
| Image build | The `tooling` image (the api Dockerfile's `build` stage) copies the repo, `content/` included. The `api` runtime image does not carry it |
| Deploy | The `migrate` service runs `prisma migrate deploy`, then `db:seed`, from the tooling image |
| Runtime | The api reads lessons from Postgres only. Nothing writes a `Lesson` row |

---

## 5. Ids

| Rule | Why |
|---|---|
| `<lang>-<English words>`: `de-separable-verbs`, not `de-trennbare-verben` | Anyone on the team can read any language's ids |
| No level in it | A lesson can move level and keep its id |
| Lowercase letters `a` to `z` and single hyphens, no digits, at most 64 characters | It goes in URLs: `/learn/de/lessons/de-separable-verbs` |
| Unique across the language's six outlines | It is `Lesson`'s primary key, and the name of its files |
| **Permanent once on `main`** | Learners' results attach to it |

Once an id is on `main`, you may retitle, rewrite or move the lesson, but never rename or delete
it. The seed fails if the database has an id that no outline has, except the `<lang>-test-` ids
that specs give their fixture lessons.

---

## 6. Moving a lesson to another level

One PR:

1. Move its outline entry to the other level's file, with the same id.
2. Move one lesson of the same kind back the other way, so both levels' counts stay exact.
3. Delete both lessons' files and write them again with the authoring kit: a lesson is written
   for its level, so the old files no longer fit.

The seed updates `level` and `position`, and results stay attached to the id.

---

## 7. Writing the lessons

Lessons are written with **Claude Code**, on each member's own subscription: no API key, no cost
per lesson. The model writes the lesson's text; the authoring kit (`apps/api/scripts/lessons/`)
writes the rest (the envelope, provenance, every duration and time limit), checks the result with
`validateLesson` and sends the issues back until the lesson is valid. The files are written once,
committed, and from then on only read (§0).

**Quality bar: a lesson that passes the validators and has no gross error is good enough.** Nobody
reviews every lesson by hand.

**What to write next** is always the head of a level: the first entries by position that have no
files yet. Ready lessons must stay a gap-free head of their outline (§8), and both ways below pick
exactly those entries.

### Setup

1. Install Claude Code and log in once (`claude`, then `/login`). In the dev container the VS Code
   extension's binary is enough: the kit finds it.
2. `make doctor` passes, and `pnpm install` has run.

### Running a level

Two ways, the same checks. Both skip a lesson that already has files.

| | In a Claude Code session | Unattended |
|---|---|---|
| Command | `/author-lessons de c1` | `pnpm --filter @ft/api lessons:author de c1` |
| Lessons | the next 12 entries without files, or the ids given | the next 12 entries without files (`--max`), or `--only` |
| Who writes | the session, checking each draft with `lessons:check` | `claude -p`, cut off from the repo; issues sent back up to `--attempts` times (default 4) |
| Gross errors | the session reads each lesson once | not read: read a few per kind before the PR |
| Fails | listed in the hand-over | last draft and issues in `$TMPDIR/ft-lessons-author/failed/` |

`lessons:author` writes each lesson as soon as it passes, so an interrupted run loses only the
lessons in progress. Its other options: `--concurrency` (default 2), `--model` (default `sonnet`),
`--effort` and `--timeout` (minutes per reply, default 15). A short rate limit is retried after
30 s, 1 min and 2 min. When the subscription's usage limit is reached, or the rate limit outlasts
the retries, it stops, and the next run picks up where it stopped.

Checking one lesson, by hand or with any other model:

```bash
pnpm --filter @ft/api lessons:check <id> --rules                    # the rules and the outline entry, to give the model
pnpm --filter @ft/api lessons:check <id> --draft draft.json         # complete + validateLesson, every issue printed
pnpm --filter @ft/api lessons:check <id> --draft draft.json --write # and write content/ when it passes
```

A draft is `{"brief":{…},"content":{…}}`, with the content left out for vocabulary or while only
the brief is written.

### Redoing a lesson

Delete `content/briefs/<id>.json` and `content/lessons/<id>.json`, then run either way with that
id (`/author-lessons <lang> <level> <id>`, or `lessons:author <lang> <level> --only <id>`). The
kit never overwrites a file.

### Time per lesson

Measured on real runs; `lessons:author` prints these figures at the end of each run.

| Level | Way | Model | Vocabulary | Grammar | Functions | Reading |
|---|---|---|---|---|---|---|
| de C1 | `lessons:author`, 4 at a time | sonnet | 2 min 14 s | 5 min 18 s | 4 min 44 s | 2 min 27 s |

---

## 8. Checks

### Automated

Tests in `apps/api/src/lessons/` check every file, so you get the answer in seconds rather than
from CI:

```bash
pnpm --filter @ft/api test src/lessons/outline-files.spec.ts   # the outlines
pnpm --filter @ft/api test src/lessons/lesson-files.spec.ts    # the lesson files
pnpm --filter @ft/api outlines:check <lang>                    # one language's outlines, while writing
pnpm --filter @ft/api lessons:check <id>                       # one lesson, while writing (section 7)
make                                                           # everything, before the PR
```

A failure names the file and the entry. `outlines:check` also checks what the specs leave to
readers: the key order, no level in an id, and no dashes, quotation marks or double spaces. Add
`--level B1` to see only that file's problems when several people share one language.

| Check | Rule |
|---|---|
| Outline file | Parses as `{ lang, level, entries }`, named after its lang and level |
| Counts | Exactly `LESSONS_PER_LEVEL[level]` entries, and each kind exactly its `KIND_COUNTS` |
| Topic and theme | `topic` exactly on grammar, `theme` exactly on the others |
| Ids | Start with the file's language, unique across the language's six files. None starts with `<lang>-test-`, a prefix kept for spec fixtures |
| Lesson files | Pass `validateLesson`, the check the seed runs: the shape of each kind, the lesson rules (length, counts, references between parts, articles), the durations to the second, a title of at most 80 characters and an objective in the course language of at most 200. Every file has an outline entry, and every content file a brief |
| Ready lessons | In each level, the lessons with files (the ready ones) are its first entries by position, with no gap |

After seeding, positions are exactly 1 to N for every language and level. `seed.e2e-spec.ts` checks
that the ready rows are exactly the lessons with files.

### By people

The checks catch shapes, not mistakes.

- **An outline:** the language's owner reads every entry (order, level fit, one focus, no
  overlap), and a second fluent reader checks at least 20 entries per level. The PR says who read
  them and what they changed.
- **Lessons:** in each PR, read a few lessons of each kind for gross errors: the wrong language,
  nonsense, a wrong answer key, an exam that does not match the lesson. When a guide could have
  prevented the error, fix the guide in the same PR.

---

## 9. Copyright

**Write from the CEFR descriptors and the model's knowledge. Never copy text from a published
inventory, word list, course or test.** You may look at Profile Deutsch, the Goethe word lists,
the English Vocabulary Profile or the Inventaire linguistique to judge what belongs at a level,
but the entries, sentences and texts must be ours. The same rule holds for the question bank
([ITEM_BANK.md](ITEM_BANK.md) §1).

---

## 10. Scoring

**The server runs every attempt, and no route takes a score.** It sends only the page the learner
is on, checks every answer, owns the exam timer, and records the result from the answers it stored
([#145](https://github.com/VictorBro/ft_transcendence/issues/145)). The rules of the attempt are
the pure functions of `lessons.player` in `@ft/shared` (#144); `AttemptsService` in
`apps/api/src/lessons/` stores their state and runs them.

| Route, under `/api/courses/:lang/lessons/:id` | Body | Answer |
|---|---|---|
| `GET attempt` | none | `AttemptRead`: `{ outline, attempt }`, read only; `attempt` is null before the first start |
| `POST attempt` | `{ locale }` | `AttemptView`: 201 a new attempt, or 200 the one in progress |
| `POST attempt/pages/:index` | `{ attemptId, answers }` | `PageResult`: 200 `{ feedback, attempt }` |
| `POST discussion` | `{ attemptId, message, history }` | A Server-Sent Events stream (§12) |

Every one of them answers 404 for a course or a lesson that does not exist, or a lesson that is not
ready, and 409 `course.notPlaced` for a course without a level.

### The attempt

One `LessonAttempt` row per course and lesson: the mother tongue, fixed at the start; a secret of
32 random bytes, never sent; the cursor (the page the learner is on); the deadline of the exam page
at the cursor; the locked answers; and, once the last page locks, the results. The plan, the lesson
as pages of answer units, is never stored: every request rebuilds it from the lesson row with
`buildPlan` (§11).

### The keys stay on the server until the lock

The browser gets the page at the cursor and nothing else: no accepted answer, right option, right
order, faulty word or explanation. Units, options and tokens are named by refs, not ids: a ref is
HMAC-SHA256 of the item's path with the attempt's secret, in base64url, cut to 16 characters. The
same attempt always gives the same refs, so nothing is stored to read them back; another attempt
gives others, so a ref from a friend's attempt is a 400. Shuffled lists are sorted by ref, so a new
attempt gets a new order.

A practice page shows its correction once its answers are locked, for that page only. An exam page
shows none. Everything comes in the results, once the last page locks. Every answer leaves through
its strict shared schema, so a key cannot leave by mistake.

### Forward only

Only the page at the cursor is taken, once, and the cursor only moves forward. Another index, the
same page again, an old `attemptId` or a finished attempt is 409 `attempt.stale`: the page then
reads the attempt again to show where the learner is. An unknown ref or an answer of the wrong kind
is 400 `attempt.invalidAnswer`, and nothing is locked. A blank unit scores 0.

Every write is one transaction that locks the course first, then the attempt row. Two submits of
the same last page give one finish: the second finds the attempt finished.

### The exam timer

An exam page's deadline is set when the server sends it: now plus the page's limit. Answers that
arrive by the deadline plus 2 seconds of network grace (`GRACE_MS` in `player/attempt.ts`, the same
margin as placement's `NETWORK_GRACE_S`) are graded. Later, the page is not even read: every unit
locks blank and Out of time. `GET attempt` never starts a timer and never locks a page; after a
deadline it shows 0 ms left.

### The finish and the retake

When the last page locks, the results are written once, and `applyFinish` records the score in the
same transaction: a whole number from the exact total, keeping the best one, then the daily goal,
the streak, XP, the daily challenge and achievements (#82, #95). The best score never goes down; a
retake may raise it, even on the same day. The daily goal counts a lesson once a day.

There is no restart before the results: with an attempt in progress, `POST attempt` returns it.
After the results, `POST attempt` is a retake: the old attempt goes, and a new one comes with a new
secret, so new refs and a new order.

`ft_lesson_attempts_total{lang, event}` counts the attempts `started` (a retake too) and
`completed` ([MONITORING.md](MONITORING.md) §5).

### What no web app can stop

The server makes a score come from answers that were really sent, page by page and in time. It
cannot make them the learner's own work:

- **Notes.** A learner can write down what the lesson showed, its presentation pages and its
  practice corrections, and read them during the exam, which tests the same points.
- **Outside help.** A dictionary, a translator, another person or an AI can answer for the learner.
  The exam timer only makes that slower.
- **The keys in this public repository.** Every brief and lesson file, accepted answers included,
  is committed under `content/`. Anyone who reads the repository can know every answer.

So a lesson score is a signal for the learner and for the daily plan, not a certificate.

---

## 11. Playing a lesson

### The pages of the web app

Every lesson has three pages under `/{locale}/learn/{lang}/lessons/{id}`, all rendered on the
server from `GET attempt`:

| Page | Path | Shows |
|---|---|---|
| Start | `…/lessons/{id}` | The title, the objective, the minutes, the sections with their numbered learning points, and Start, Resume or See the results |
| Player | `…/lessons/{id}/play` | The page at the cursor, one at a time, with the outline in a sidebar and the practice score in the header |
| Results | `…/lessons/{id}/results` | The score, the practice and exam tallies, and every answer with its correction |

The player renders each kind's items with its own components (`apps/web/components/lesson/kinds/`),
so there are four lesson experiences, one per kind:

| Kind | Issue | On `main` |
|---|---|---|
| Grammar | #146 | Yes |
| Vocabulary | #147 | Yes |
| Functions | #149 | Yes |
| Reading | #148 | Not yet (PR #203). Until it merges, a reading lesson's start page says "This kind of lesson cannot be played here yet." The server side, its plan and its attempt are already in place |

### The plan

`buildPlan(lesson, motherTongue)` turns a lesson's brief and content into the pages of one attempt,
each with its answer units. Every page has one of five roles (`PageRole`):

| Role | What it is | Scored |
|---|---|---|
| `presentation` | Something to read, nothing to answer | No |
| `practice` | Exercises, corrected page by page | Yes, 35% of the score by default |
| `discussion` | The talk with the tutor before the exam (§12) | No |
| `examIntro` | The exam info page: its pages, questions and countdowns | No |
| `exam` | A timed page, corrected only in the results | Yes, 65% by default |

What a kind does differently lives in its module, `packages/shared/src/lessons/player/kinds/`.

### The mother tongue rule

The help around the lesson (instructions, translations, native prompts) is in the learner's
**mother tongue**: the interface locale, unless that is the course language itself, in which case
it is the first other locale in the order en, fr, de. There is no profile setting for it.

| Interface | Course | Mother tongue |
|---|---|---|
| de | fr | de |
| fr | fr | en |
| en | en | fr |

It is computed by `motherTongue(locale, lang)` from the `locale` sent to `POST attempt`, and
**fixed on the attempt at its start** (`LessonAttempt.motherTongue`): switching the interface
language mid-lesson does not change the prompts or the expected translations of that attempt.

### Vocabulary without listening

The prototype's vocabulary lessons have two listening items, a listening choice and a dictation.
The player leaves both out, together with the pages and steps they leave empty, so **a vocabulary
exam is the translation only**. The brief is untouched: the cut happens in the vocabulary kind
module when the plan is built.

Functions lessons keep their listening reply. The browser reads the text aloud through its speech
synthesis, and **Show the text** writes it out, so the exercise can still be done when the browser
offers no voice for the language.

---

## 12. The discussion step

Every lesson has one **discussion page**, unscored, right before the exam info page. The plan adds
it before the first exam page for every kind; a grammar lesson's feedback placeholder already sits
there and becomes it. On that page the learner can talk with the lesson's tutor, an LLM, then moves
on to the exam. Skipping the talk costs nothing.

**What the learner sees** (#151): a chat window with three suggested prompts (explain my mistakes,
a summary, an example), the answer appearing as it is written, Stop, and the earlier turns of this
visit. The turns live in the page only: leaving the page forgets them.

**What the server does** (#150): `POST /api/courses/:lang/lessons/:id/discussion` with
`{ attemptId, message, history }` (`LessonDiscussionSchema`). It answers as **Server-Sent Events**
on that one response: `delta { text }` for each piece, then `done {}`, or `error { code }`, with a
`: heartbeat` comment every 15 s. [ARCHITECTURE.md](ARCHITECTURE.md) §5 traces it.

| Rule | How |
|---|---|
| Only on the discussion page | The attempt's cursor must be on its discussion page, else 409 `attempt.stale`. Once the exam starts, the tutor is gone |
| The tutor knows the lesson, not the answers | The system prompt is built on the server from a pick of the brief's teaching fields per kind. Never the content file, the brief's exam plan, or a reading lesson's genre and documents, since the exam asks about a new document of the same genre |
| It can explain the learner's mistakes | The prompt also holds the attempt's wrong practice answers, at most 20, read from `LessonAttempt.answers`. Exam answers never: none is locked before the discussion page |
| It answers in the interface language | The prompt asks for the learner's interface locale, with course-language examples |
| Nothing is stored | The browser sends the last 10 turns back with each message. The server keeps no transcript |
| Bounded | A message is at most 500 characters, an answer at most 1,000 output tokens, and the learner's and global per-minute and per-day limits apply ([DEPLOYMENT.md](DEPLOYMENT.md) §5) |

With `LLM_PROVIDER=fixture`, the default in development and CI, the tutor gives one canned answer.
With `LLM_PROVIDER=disabled`, every message ends with the error `llm.disabled`.
