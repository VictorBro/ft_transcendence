# Lessons: authoring guide

What a lesson is, how many each level has, and how to write, check and review them. The lessons
are the course the learner follows, so a wrong one does not confuse one learner: it teaches
everyone who reaches it. See [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) for how the
daily goal and the all lessons page use them.

Audience: whoever writes an outline, runs the generator or reviews a level.

---

## 1. What a lesson is

A lesson is one row of a **seeded catalogue**. It is written in `content/`, reviewed in a PR and
loaded by `db:seed`. Nothing writes a lesson at runtime.

A lesson takes **about ten minutes**. That is why the daily goal is a count: 10, 30 or 60
minutes means 1, 3 or 6 lessons finished that day.

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

**For the learner:** a `title` (1 to 80 characters) and a `summary` (1 to 200), plain trimmed
strings. They appear on the daily goal page and the all lessons page, and the text search matches
them.

**For the tutor:** a `brief`, which the next milestone's tutor turns into the lesson itself. The
learner never sees it, and the API never sends it to the browser.

| Field | Count | What it holds |
|---|---|---|
| `objective` | 1 | What the learner can do after the lesson |
| `points` | 2 to 6 | The rules or facts to teach |
| `examples` | 3 to 8 | Original example sentences |
| `pitfalls` | 1 to 4 | Real mistakes learners make |
| `vocabulary` | 6 to 15 | `{ term, gloss }` pairs. Required on vocabulary lessons, optional on the others |

Every brief string is at most 300 characters, a `term` at most 60 and a `gloss` at most 120.

**One language per lesson: the course's.** The title, the summary, the brief and the outline
line are all in the language being learned, like a question in the bank. The interface language
only changes the page around it: a learner of German with a French interface still sees
"Trennbare Verben".

**A gloss is a definition, never a translation.** It is a short explanation in the course
language, so it works for every interface language.

| | Gloss of `le quai` |
|---|---|
| Wrong | "platform" |
| Right | "l'endroit de la gare, le long des voies, où l'on monte dans le train" |

---

## 2. Counts and kind shares per level

The same for de, en and fr: 1,330 lessons per language, about 4,000 in all.

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
the constant, for all three languages at once, and stays inside the allowed range. Every language
keeps the same count, because the sources agree across the three: the differences go in the
kind shares below.

**Kind shares per level**, in %, from `KIND_SHARES`:

| Level | Grammar | Vocabulary | Functions | Reading |
|---|---|---|---|---|
| A1 | 35 | 45 | 12 | 8 |
| A2 | 35 | 40 | 12 | 13 |
| B1 | 25 | 48 | 10 | 17 |
| B2 | 20 | 50 | 12 | 18 |
| C1 | 10 | 50 | 12 | 28 |
| C2 | 8 | 52 | 10 | 30 |

The grammar share falls from B1, and the number of grammar lessons falls after B2 (40 to 60 per
level up to B2, about 26 at C1 and C2). Vocabulary and reading take the rest. Each language may
shift about 5 points between kinds, and the count per level stays the same:

| Language | Shift |
|---|---|
| de | About 5 points more grammar at A1 to B1 (cases, adjective endings, word order) |
| fr | About 5 points more grammar at A1 to B1 (verb forms, object pronouns, the subjunctive) |
| en | About 5 points more vocabulary at B1 to C2 (phrasal verbs, idioms) |

---

## 3. Where the counts come from

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

## 4. The files

Two files per language and level, so twelve per language:

| File | Holds | Written by |
|---|---|---|
| `content/outlines/<lang>-<level>.json` | `{ lang, level, entries }`: the ordered plan | A fluent speaker, maybe from an LLM draft |
| `content/lessons/<lang>-<level>.json` | `{ lang, level, lessons }`: the full lessons | The generator, then reviewers |

File names are lowercase, for example `fr-a1.json`, and must match the `lang` and `level`
inside. Inside the file, `level` is uppercase, `A1` to `C2`:

```json
{ "lang": "fr", "level": "A1", "entries": [ ... ] }
```

An **outline entry** is `{ id, kind, topic?, theme?, workingTitle, intent }`. The working title
and the intent are one line each, in the course language. A **lesson** is the entry's `id`,
`kind` and `topic` or `theme`, then `title`, `summary` and `brief`.

Neither has a `lang`, `level` or `position`: the seed adds them. **The position is the entry's
place in the file**, from 1. The order matters: no lesson is locked, but the daily goal proposes
the lowest lessons not yet passed, so the order is the course a learner follows.

Entry 2 of `content/outlines/fr-a1.json`, so position 2 of French A1:

```json
{ "id": "fr-definite-articles", "kind": "grammar", "topic": "nouns_and_determiners", "workingTitle": "Le, la, les", "intent": "Choisir l'article défini selon le genre et le nombre du nom." }
```

The lesson it becomes in `content/lessons/fr-a1.json`, all in French:

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

**Writing an outline:**

- Exactly the level's count, with the kind shares of §2.
- One focus per lesson, sized to ten minutes.
- Each lesson builds on the ones before it, and on the levels below.
- No two entries teach the same thing, across all six levels of the language.
- An LLM may write the first draft. A fluent speaker then reads every entry (§9).

---

## 5. Ids

| Rule | Why |
|---|---|
| `<lang>-<English words>`: `de-separable-verbs`, not `de-trennbare-verben` | Anyone on the team can read any language's ids |
| No level in it | A lesson can move level and keep its id |
| Lowercase ASCII and hyphens, at most 64 characters | It goes in URLs: `/learn/de/lessons/de-separable-verbs` |
| Unique across the language's six files | It is `Lesson`'s primary key |
| **Permanent once on `main`** | Learners' results attach to it |

Once an id is on `main`, you may retitle, rewrite or move the lesson, but never rename or
delete it. The seed fails if the database has an id that no file has.

---

## 6. Moving a lesson to another level

One PR, three steps:

1. Move its outline entry and its lesson to the other level's files, with the same id.
2. Move one lesson back the other way, so both counts stay exact.
3. Nothing else: the seed updates `level` and `position`, and results stay attached.

---

## 7. The generator

[#83](https://github.com/VictorBro/ft_transcendence/issues/83) writes this section: running it,
regenerating a lesson or a level, the cost.

---

## 8. The automated checks

Tests in `apps/api/src/lessons/` check every file, so you get the answer in seconds rather than
from CI:

```bash
pnpm --filter @ft/api test src/lessons/outline-files.spec.ts   # the outlines
pnpm --filter @ft/api test src/lessons/lesson-files.spec.ts    # the lessons
make                                                           # everything, before the PR
```

A failure names the file and the entry.

| Check | Rule |
|---|---|
| Outline file | Parses as `{ lang, level, entries }`, named after its lang and level |
| Lesson file | Parses as `{ lang, level, lessons }`, with the field limits of §1 |
| Counts | Exactly `LESSONS_PER_LEVEL[level]` entries |
| Kind shares | Each kind within 10 points of `KIND_SHARES`, and at least 5% of the level, so a daily challenge that asks for one kind always finds lessons of it |
| Topic and theme | `topic` exactly on grammar, `theme` exactly on the others, `vocabulary` on every vocabulary lesson |
| Ids | Start with the file's language, unique across the language's six files |
| Titles | Unique within a language after `foldText` (accents removed, lowercase, ß to ss, œ to oe, æ to ae) |
| Lessons match the outline | Every lesson file has an outline, with the same ids in the same order and the same kind, topic and theme |
| Complete languages | A language in `COMPLETE_LANGUAGES` has all six lesson files |

After seeding, positions are exactly 1 to N for every language and level.

---

## 9. Reading an outline and reviewing lessons

The checks catch shapes, not mistakes. A fluent speaker catches those.

### Reading an outline in full

- The language's owner reads **every entry**: order, level fit, one focus, no overlap.
- A second fluent reader checks **at least 20 entries per level** for order and level fit.
  German's second reader comes from outside the team, which has one German speaker.
- The PR says who read every entry and what they changed.

### Reviewing the lessons of a level

Sample **at least 10% of the level, and at least two lessons of each kind**: 12 of 120 at A1, 32
of 320 at C2. For each sampled lesson, check:

- [ ] the level fits
- [ ] the objective matches the outline's intent
- [ ] the examples are correct and natural in the course language
- [ ] the pitfalls are real mistakes
- [ ] vocabulary glosses are short definitions in the course language, never translations
- [ ] the title and summary read naturally
- [ ] nothing is copied (§10)

A lesson that fails a check is bad. Fix it by editing it in place, or by deleting it and
generating it again.

If **more than one sampled lesson in ten is bad**, the prompt is the problem, not the lessons:

1. Fix the prompt.
2. Delete that level's lessons.
3. Run the generator again.
4. Sample again.

The PR lists the sampled ids of each level, each with a verdict:

```text
A1: 12 of 120 sampled, 1 bad
de-separable-verbs: ok
de-family: edited, example "Meine Schwester ist 12 Jahre." is now "Meine Schwester ist 12 Jahre alt."
```

When a language has all six levels, add it to `COMPLETE_LANGUAGES` in `lesson-files.spec.ts`, and
say in the AI part of the README's Resources section that the LLM drafted the lessons and who
reviewed them. The subject requires it.

---

## 10. Copyright

**Write from the CEFR descriptors and the model's knowledge. Never copy text from a published
inventory, word list, course or test.** You may look at Profile Deutsch, the Goethe word lists,
the English Vocabulary Profile or the Inventaire linguistique to judge what belongs at a level,
but the entries, sentences and definitions must be ours. The same rule holds for the question
bank ([ITEM_BANK.md](ITEM_BANK.md) §1).

---

## 11. French A1 goes first

**French A1 goes first**, on its own
([#84](https://github.com/VictorBro/ft_transcendence/issues/84)). It is the demo level and every
e2e test runs on it, and most of the team speaks French, so a full read and a second reader are
easy to find.

- A French owner reads every outline entry and **every lesson**, not a sample.
- The first 42 lessons (one week at 60 minutes a day) must make sense in order.
- The prompt is tuned there: generate, read, fix the prompt, delete the lessons, run again.
- The final prompt from French A1 is the one every other level uses.
