# Item bank: authoring spec

What to write, in what shape, so placement questions can be seeded, served and never repeated for
the same learner. See [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.2 for why the bank
exists.

Audience: whoever authors the French and German sets.

---

## 1. Two rules

**Never copy items from a published test.** Goethe materials and sites like
internationalenglishtest.com are protected. Imitate the *format* freely: short questions,
four options each, difficulty rising through the set. The *sentences* must be ours.

**Placement questions are multiple choice only.** No free text, no translation. Those make good
lesson exercises and bad measurements: scoring them needs an LLM judge, which is slow while a
learner waits, and gives the same answer different verdicts on different runs, so two tests stop
being comparable. Free text belongs in lessons, where a judgement call is teaching rather than
measuring.

---

## 2. What to write

| | |
|---|---|
| Categories | `grammar`, `vocabulary`, `reading` |
| Levels | `A1 A2 B1 B2 C1 C2` |
| Items per cell | 5 |
| **Total per language** | **90** |

Five per cell is deliberately modest. A run probes at most three levels and asks two questions
per category at each, so two or three runs drain a learner's cells and the app starts generating
new questions, which is exactly the behaviour we want to demonstrate. A huge seed bank would hide
that path rather than exercise it.

Start with `grammar` and `vocabulary`, which are one sentence each. Add `reading` after, since
every item needs a passage written too.

**Listening is out of scope.** It needs recorded audio or TTS, file storage, playback and its own
accessibility story.

---

## 3. The shape of an item

One file per language and category, under `content/items/`, named after the two it declares:
`de-grammar.json`, `fr-reading.json`. The field names are the `QuestionBank` column names, so the
seed is a straight insert.

Every item is the same shape: a question, four options, one correct answer and a time limit.
`content/items/de-grammar.json`:

```jsonc
{
  "lang": "de",
  "category": "grammar",
  "items": [
    {
      "sourceId": "de-gram-0001",
      "level": "A1",
      "topic": "verbs_morphology",
      "question": "Ich ___ aus Spanien.",
      "options": ["ist", "sind", "bin", "sein"],
      "answer": "bin",
      "timeLimitS": 30
    }
  ]
}
```

Reading is the one category that differs, and it differs by a single field: `readText`, the
passage the question is about. It has its own file, so a reading item never sits next to a
grammar one. `content/items/de-reading.json`:

```jsonc
{
  "lang": "de",
  "category": "reading",
  "items": [
    {
      "sourceId": "de-read-0001",
      "level": "A2",
      "topic": "information_structure_and_pragmatics",
      "readText": "Maria arbeitet in einer kleinen Bäckerei am Bahnhof. Sie beginnt um fünf Uhr morgens.",
      "question": "Wann beginnt Maria mit der Arbeit?",
      "options": ["Um fünf Uhr", "Um sieben Uhr", "Am Mittag", "Am Abend"],
      "answer": "Um fünf Uhr",
      "timeLimitS": 75
    }
  ]
}
```

| Field | Rule |
|---|---|
| `sourceId` | `<language>-<gram\|voca\|read>-<4 digits>`, matching the file it lives in. Unique across every file and **permanent**: the seed matches on it, so reusing one overwrites another question |
| `level` | `A1` to `C2` |
| `topic` | From §4. Keeps a cell from being five questions about the same thing |
| `readText` | Reading questions only, omit otherwise |
| `question` | A fill-in-the-blank uses `___` |
| `options` | Exactly 4, all different |
| `answer` | The correct string, must appear verbatim in `options`. Text and not an index, so options can be shuffled when served |
| `timeLimitS` | Seconds to answer. Long enough to read and think, short enough that looking it up does not fit |

Time limits rise with the level and with how much there is to read. What the seeded set uses:

| Category | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|
| `vocabulary` | 30 | 30 | 45 | 45 | 60 | 60 |
| `grammar` | 30 | 45 | 60 | 60 | 75 | 90 |
| `reading` | 60 to 75 | 75 to 90 | 90 | 105 to 120 | 120 to 165 | 150 to 180 |

Reading is a range because the passage length drives it. Match a neighbour of the same length
rather than picking a number.

Write plausible wrong answers. A distractor nobody would pick makes the question free.

---

## 3b. Checking your work

The files are validated by a test, so you get the answer in seconds rather than from CI:

```bash
pnpm --filter @ft/api test src/items/item-files.spec.ts   # just the item files
make                                                      # everything, before the PR
```

It fails, with the offending id and a readable message, on: an answer that is not one of the
options, options that are not exactly four or are not all different, a `sourceId` in the wrong
format, reused by another file, or disagreeing with the language and category of the file it sits
in, a reading question with no `readText` or a non-reading one with it, an unknown `level` or
`topic`, a missing or non-positive `timeLimitS`, and any field that is not in the list above.

`content/items/en-*.json` are working examples of all three shapes. Copy one and edit.

## 4. Topics

```
nouns_and_determiners      pronouns                  verbs_morphology
verb_usage                 syntax_and_sentence_structure
subordinate_clauses        prepositions_and_case     adjectives
adverbs                    agreement                 negation
comparison_and_quantity    information_structure_and_pragmatics
```

Vocabulary and reading items use the closest fit, or
`information_structure_and_pragmatics`. Same list keys the lesson topics, so an item and the
lesson that teaches it speak the same language.

---

## 5. The database

Two tables. The JSON files are the source of truth in git; the seed script loads them.

```prisma
model QuestionBank {
  id         String           @id @default(uuid()) @db.Uuid
  // The id from the file, and null on a question the LLM wrote at runtime.
  // That is also how the two are told apart: a question with no sourceId is one
  // no human reviewed.
  sourceId   String?          @unique
  lang       Language
  level      Level
  topic      Topic
  category   QuestionCategory                   // vocabulary | grammar | reading
  readText   String?                            // reading questions only
  question   String
  options    String[]
  answer     String
  timeLimitS Int
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  userSeenQuestions UserSeenQuestion[]

  @@index([lang, level, category])
}

model UserSeenQuestion {
  userId     String @db.Uuid
  questionId String @db.Uuid

  @@unique([userId, questionId])
}
```

Two ids on purpose. `id` is the internal key every other table points at, so nothing breaks when
a question is re-seeded. `sourceId` is yours, it is how the seed finds the row to update, and
editing a question in the JSON file changes the row instead of creating a second one.

A learner is not asked the same question twice: the draw excludes every question already tied to
that user through `UserSeenQuestion`. It is keyed per user and not per run, so a retake cannot
serve an old question either. The single exception is an LLM outage, step 3 of the cascade in
[PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.2. Table detail is in §7.2 there.

There is deliberately no difficulty score, no served/correct counters and no calibration. Those
would need hundreds of answers per question before they meant anything, and this platform will
never see that many. A column nobody can act on is worse than no column, because the next reader
assumes it works.

---

## 6. When the bank runs dry

A learner who exhausts a cell is never blocked: the app generates a question in the same shape as
above, validates it, saves it with no `sourceId` and serves it. It stays, so the next
learner to reach that cell gets it from the bank. **The bank grows as it is used**, which is why
90 authored questions per language is enough. The full cascade, including what happens when the
LLM is down, is in [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.2.

---

## 7. Reviewing generated items

Drafting a batch with the LLM and reviewing it is a fine way to fill the seed, and far faster
than writing 90 by hand. Shipping unreviewed is not: a wrong question does not confuse one
learner, it mislabels everyone who sees it. A reviewer checks that the answer is genuinely
correct, that the other three are genuinely wrong, that the level is plausible, and that the
sentence sounds natural rather than translated.

The README's Resources section has to record that the LLM drafted them and who verified them.
The subject requires it.
