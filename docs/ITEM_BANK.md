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

Every item is the same shape, whatever the skill: an optional passage, a question, four options,
one correct answer. A reading item is simply one that has a passage.

```jsonc
{
  "lang": "de",
  "category": "grammar",
  "items": [
    {
      "id": "0f8a7c31-5d2e-4b16-9a44-1c7e0b3d5f82",
      "level": "A1",
      "topic": "verbs_morphology",
      "question": "Ich ___ aus Spanien.",
      "options": ["ist", "sind", "bin", "sein"],
      "answer": "bin"
    },
    {
      "id": "6b91d4e7-83af-42c0-b5d8-9e2f1a604c37",
      "level": "A2",
      "topic": "information_structure_and_pragmatics",
      "readText": "Maria arbeitet in einer kleinen Bäckerei am Bahnhof. Sie beginnt um fünf Uhr morgens.",
      "question": "Wann beginnt Maria mit der Arbeit?",
      "options": ["Um fünf Uhr", "Um sieben Uhr", "Am Mittag", "Am Abend"],
      "answer": "Um fünf Uhr"
    }
  ]
}
```

One file per language and category, under `content/items/`: `de-grammar.json`, `fr-reading.json`.
The field names are the `QuestionBank` column names, so the seed is a straight insert.

| Field | Rule |
|---|---|
| `id` | A UUID, generated once and **never changed**. It is the primary key and `UserSeenQuestion` rows point at it, so reissuing an id makes a learner see a question twice |
| `level` | `A1` to `C2` |
| `topic` | From §4. Keeps a cell from being five questions about the same thing |
| `readText` | Reading questions only, omit otherwise |
| `question` | A fill-in-the-blank uses `___` |
| `options` | Exactly 4, all different |
| `answer` | The correct string, must appear verbatim in `options`. Text and not an index, so options can be shuffled when served |

Write plausible wrong answers. A distractor nobody would pick makes the question free.

---

## 3b. Checking your work

The files are validated by a test, so you get the answer in seconds rather than from CI:

```bash
pnpm --filter @ft/api test           # just the item files
make                                 # everything, before you open a PR
```

It fails, with the offending id and a readable message, on: an answer that is not one of the
options, options that are not exactly four or are not all different, an id that is not a UUID or
is reused by another file, a reading question with no `readText` or a non-reading one with it, an
unknown `level` or `topic`, and any field that is not in the list above.

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
  id         String           @id @db.Uuid      // the id from the file
  lang       Language
  level      Level
  category   QuestionCategory                   // vocabulary | grammar | reading
  topic      GrammarTopic
  readText   String?                            // reading questions only
  question   String
  options    String[]
  answer     String
  // Written at runtime when a learner exhausted a cell and the LLM made a new
  // question. It stays in the bank and is served to everyone afterwards.
  // Flagged because, unlike the seeded ones, no human reviewed it.
  generated  Boolean          @default(false)
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

`timeLimitS` is not authored. The seed sets it from the category, because a reading question
needs longer than a vocabulary one.

A learner is never asked the same question twice, and `UserSeenQuestion` is what guarantees it:
the draw excludes every question already tied to that user. It is keyed per user and not per run,
so a retake cannot serve an old question either. See
[PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §7.2.

There is deliberately no difficulty score, no served/correct counters and no calibration. Those
would need hundreds of answers per question before they meant anything, and this platform will
never see that many. A column nobody can act on is worse than no column, because the next reader
assumes it works.

---

## 6. When the bank runs dry

A learner who exhausts a cell is never blocked: the app generates a question in the same shape as
above, validates it, saves it with `generated = true` and serves it. It stays, so the next
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
