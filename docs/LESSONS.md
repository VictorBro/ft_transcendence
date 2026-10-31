# Lessons: authoring guide

What a lesson is, how many each level has, and how they are planned, written and checked. See
[PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) for how the daily goal and the all lessons page
use them, and [#137](https://github.com/VictorBro/ft_transcendence/issues/137) for why the lesson
model is the one of the lesson prototype.

Audience: whoever writes an outline, runs the authoring tool or checks a level.

---

## 1. What a lesson is

A lesson is one row of a **seeded catalogue**. Its plan is an outline entry, its body is one or
two JSON files, both committed to the repo and loaded by `db:seed`. Nothing writes a lesson at
runtime: no AI writes or changes a lesson while a learner uses the app.

The daily goal counts lessons: 10, 30 or 60 minutes means 1, 3 or 6 lessons finished that day.
How long a lesson really takes is still open for the team
([PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.3).

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
answer keys, an exam and how it is scored. Its schemas and validators move to `@ft/shared` with
[#135](https://github.com/VictorBro/ft_transcendence/issues/135).

- **The brief** (`content/briefs/<id>.json`, every kind) holds the plan of the lesson: the title,
  the objective, the words, rules, expressions or documents, and the exam.
- **The content** (`content/lessons/<id>.json`, every kind except vocabulary) holds the lesson as
  the learner plays it: steps, pages and items. A vocabulary lesson has no content file: its
  lesson is derived from its brief.
- Both start with the same envelope: `schemaVersion`, `id`, `kind`, `lang`, `level`, `locales`,
  `title`, `objective`, `estimatedMinutes` and `provenance`.

**Languages in a lesson.** What is learned (words, sentences, texts, answers) is in the course
language. The help around it (the objective, instructions, translations) is in English, French and
German, so the lesson works for every interface language.

**What the learner sees before opening it.** The title, in the course language, and a summary: the
objective in the course language. Both appear on the daily goal page and the all lessons page, and
the text search matches them. A title is at most 80 characters and a summary at most 200.

---

## 2. Counts per level and per kind

The same for de, en and fr: 1,330 lessons per language, 3,990 in all.

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
every level, so a daily challenge that asks for one kind always finds lessons of it.

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
no lesson is locked, but the daily goal proposes the lowest lessons not yet passed, so the order is
the course a learner follows.

Entry 2 of `content/outlines/fr-a1.json`, so position 2 of French A1:

```json
{ "id": "fr-subject-pronouns", "kind": "grammar", "topic": "pronouns", "workingTitle": "Les pronoms je, tu, il, elle…", "intent": "Employer les pronoms sujets je, tu, il, elle, on, nous, vous, ils et elles, choisir tu ou vous selon la personne, ils ou elles selon le groupe, et on pour dire nous à l'oral." }
```

**Before its files exist**, its `Lesson` row has `title` = the working title, `summary` = the
intent, and an empty brief ([#134](https://github.com/VictorBro/ft_transcendence/issues/134)). So
every level is listed, searchable and finishable through the stub page from day one.

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

## 4. The lesson files

| File | Kinds | Holds |
|---|---|---|
| `content/briefs/<id>.json` | all four | The envelope and the plan of the lesson |
| `content/lessons/<id>.json` | grammar, functions, reading | The envelope and the lesson as played: steps, pages, items |

The `id`, `kind`, `lang`, `level` and `topic` or `theme` of both files must match the outline
entry, and the content file repeats the brief's `title` and `objective` word for word. Once the
files exist, the seed sets the row's `title` to the envelope's title, its `summary` to the
objective in the course language, and its `brief` and `content` to the files
([#135](https://github.com/VictorBro/ft_transcendence/issues/135)). An invalid file stops the
seed, naming the id and the errors, and so does a file that no outline entry plans.

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

The full shape of each kind is in the schemas of `@ft/shared` (#135), and in the authoring guides
of `docs/authoring/` (#83).

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
3. Delete both lessons' files and write them again with the authoring tool: a lesson is written
   for its level, so the old files no longer fit.

The seed updates `level` and `position`, and results stay attached to the id.

---

## 7. Writing the lessons

Lessons are written with **Claude Code**, on each member's own subscription: no API key, no cost
per lesson. The model writes the lesson's text; the authoring kit (`apps/api/scripts/lessons/`)
writes the rest (the envelope, provenance, every duration and time limit), checks the result with
`validateLesson` and sends the issues back until the lesson is valid. Nothing is generated at
runtime or at deploy: the files are written once and committed.

**Quality bar: a lesson that passes the validators and has no gross error is good enough.** Nobody
reviews every lesson by hand.

**Order of the runs:** French A1 first (the demo level, which every e2e test uses), then German
A1 and English A1, then A2 to C2.

### Setup

1. Install Claude Code and log in once (`claude`, then `/login`). In the dev container the VS Code
   extension's binary is enough: the kit finds it.
2. `make doctor` passes, and `pnpm install` has run.

### Running a level

Two ways, the same checks. Both skip a lesson that already has files.

| | In a Claude Code session | Unattended |
|---|---|---|
| Command | `/author-lessons de c1` | `pnpm --filter @ft/api lessons:author de c1` |
| Lessons | positions 1 to 12, or the ids given | every lesson without files, or `--kind`, `--only`, `--max` |
| Who writes | the session, checking each draft with `lessons:check` | `claude -p`, cut off from the repo; issues sent back up to `--attempts` times |
| Gross errors | the session reads each lesson once | not read: read a few per kind before the PR |
| Fails | listed in the hand-over | last draft and issues in `$TMPDIR/ft-lessons-author/failed/` |

`lessons:author` writes each lesson as soon as it passes, so an interrupted run loses only the
lessons in progress. When the subscription's usage limit is reached it stops, and the next run
picks up where it stopped. `--provider deepseek` uses the DeepSeek API instead, paid per token
from `DEEPSEEK_API_KEY` (`.env.example`); it is never chosen on its own.

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
| de C1 | TODO | | | | | |

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
| Complete languages | A language in `COMPLETE_LANGUAGES` has the files of every outline entry |

After seeding, positions are exactly 1 to N for every language and level.

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
