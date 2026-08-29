# Item bank: authoring spec

What to write, in what shape, so placement questions can be seeded, served and never repeated for
the same learner. See [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §1.2 for why the bank
exists.

Audience: whoever authors the French and German sets.

---

## 1. Two rules

**Never copy items from a published test.** Goethe materials and sites like
internationalenglishtest.com are protected. Imitate the *format* freely: four skills,
four-option multiple choice, difficulty rising through the set. The *sentences* must be ours.

**Placement questions are multiple choice only.** No free text, no translation. Those make good
lesson exercises and bad measurements: scoring them needs an LLM judge, which is slow while a
learner waits, and gives the same answer different verdicts on different runs, so two tests stop
being comparable. Free text belongs in lessons, where a judgement call is teaching rather than
measuring.

---

## 2. What to write

| | |
|---|---|
| Skills | `grammar`, `vocabulary`, `reading` |
| Levels | `A1 A2 B1 B2 C1 C2` |
| Items per cell | 5 |
| **Total per language** | **90** |

Five per cell is deliberately modest. A test serves about 12 questions, a learner draws from
their own level and its neighbours, so a few retakes exhaust their band and the app starts
generating new questions, which is exactly the behaviour we want to demonstrate. A huge seed
bank would hide that path rather than exercise it.

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
  "language": "de",
  "skill": "grammar",
  "items": [
    {
      "id": "de-gram-0001",
      "cefr": "A1",
      "topic": "verbs_morphology",
      "prompt": "Ich ___ aus Spanien.",
      "options": ["ist", "sind", "bin", "sein"],
      "answer": "bin"
    },
    {
      "id": "de-read-0001",
      "cefr": "A2",
      "topic": "information_structure_and_pragmatics",
      "passage": "Maria arbeitet in einer kleinen Bäckerei am Bahnhof. Sie beginnt um fünf Uhr morgens.",
      "prompt": "Wann beginnt Maria mit der Arbeit?",
      "options": ["Um fünf Uhr", "Um sieben Uhr", "Am Mittag", "Am Abend"],
      "answer": "Um fünf Uhr"
    }
  ]
}
```

One file per language and skill, under `content/items/`: `de-grammar.json`, `fr-reading.json`.

| Field | Rule |
|---|---|
| `id` | Unique and **permanent**. `ItemExposure` points at it, so renumbering makes a learner see a question twice |
| `cefr` | `A1` to `C2` |
| `topic` | From §4. Keeps a cell from being five questions about the same thing |
| `passage` | Reading items only, omit otherwise |
| `prompt` | The question. A fill-in-the-blank uses `___` |
| `options` | Exactly 4, all different |
| `answer` | The correct string, must appear verbatim in `options`. Text and not an index, so options can be shuffled when served |

Write plausible wrong answers. A distractor nobody would pick makes the question free.

---

## 3b. Checking your work

The files are validated by a test, so you get the answer in seconds rather than from CI:

```bash
pnpm --filter @ft/shared test        # just the item files
make                                 # everything, before you open a PR
```

It fails, with the offending id and a readable message, on: an answer that is not one of the
options, options that are not exactly four or are not all different, an id in the wrong format or
reused by another file, a reading item with no passage or a non-reading item with one, an unknown
`cefr` or `topic`, and any field that is not in the list above.

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
model ItemBank {
  id        String       @id                    // the id from the file
  language  LearningLang
  skill     Skill                               // grammar | vocabulary | reading
  cefr      CefrLevel
  topic     GrammarTopic
  passage   String?                             // reading items only
  prompt    String
  options   String[]
  answer    String
  // Written at runtime when a learner exhausted their level and the LLM made a
  // new question. It stays in the bank and is served to everyone afterwards.
  // Flagged because, unlike the seeded ones, no human reviewed it.
  generated Boolean      @default(false)
  createdAt DateTime     @default(now())

  exposures ItemExposure[]

  @@index([language, skill, cefr])
}

// What this learner has already been asked. The whole reason a retake is a new
// test rather than the same one again.
model ItemExposure {
  userId   String   @db.Uuid
  itemId   String
  servedAt DateTime @default(now())

  user User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  item ItemBank @relation(fields: [itemId], references: [id])

  @@id([userId, itemId])
  @@index([userId])
}
```

There is deliberately no difficulty score, no served/correct counters and no calibration. Those
would need hundreds of answers per question before they meant anything, and this platform will
never see that many. A column nobody can act on is worse than no column, because the next reader
assumes it works.

---

## 6. When the bank runs dry

Three steps, and the learner is never blocked:

1. **Draw from the bank**, excluding anything in `ItemExposure` for this learner.
2. **Nothing left at this level: generate one.** A structured LLM call against the same shape as
   above, validated, saved to `ItemBank` with `generated = true`, then served. It stays, so the
   next learner to reach that level gets it from step 1 for free. **The bank grows as it is used.**
3. **Generation failed** (API down or rate-limited): serve this learner's least recently seen
   question. A repeat after months is a weaker measurement than a fresh question, and a far
   better outcome than an abandoned test.

---

## 7. Reviewing generated items

Drafting a batch with the LLM and reviewing it is a fine way to fill the seed, and far faster
than writing 90 by hand. Shipping unreviewed is not: a wrong question does not confuse one
learner, it mislabels everyone who sees it. A reviewer checks that the answer is genuinely
correct, that the other three are genuinely wrong, that the level is plausible, and that the
sentence sounds natural rather than translated.

The README's Resources section has to record that the LLM drafted them and who verified them.
The subject requires it.
