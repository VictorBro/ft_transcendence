# #91: feat(content): generate and review the German lesson drafts

> Text of [issue #91](https://github.com/VictorBro/ft_transcendence/issues/91) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

Generate the German lessons, A1 to C2, from the reviewed outline, with the prompt settled on French A1 (#84). CI checks every file, and a German speaker reviews a sample.

**Needs:** #83 (the script), #88 (the outline), #84 (its prompt), #79 (its seed, which `make` and the position check need), #117 
**Unblocks:** nothing. But the milestone cannot close without it: placement can put a learner at any level up to C2 (the placement API, #71), so every level needs its lessons.

## What to do

- Generate `content/lessons/de-a1.json` to `de-c2.json` with `pnpm --filter @ft/api lessons:generate de <level>`, on the free tier.
- Review a sample of each level: at least 10%, and at least two lessons of each kind. For each lesson, check:
  - the level fits
  - the objective matches the intent
  - the examples are correct, natural German
  - the pitfalls are real
  - vocabulary glosses are short German definitions, never translations
  - the title and summary read naturally
  - nothing is copied
- Fix a bad lesson by editing it in place, or by deleting it and generating it again.
- If more than one sampled lesson in ten is bad: fix the prompt, delete that level's lessons, run the generator again, and sample again.
- Add `de` to `COMPLETE_LANGUAGES` in `lesson-files.spec.ts`.
- In the AI part of the README's Resources section (fill the TODO there if it is still open), say that the LLM drafted the German lessons, and who reviewed them.

## Examples

<details><summary>Example: one generated lesson in content/lessons/de-a1.json</summary>

```json
{
  "id": "de-separable-verbs",
  "kind": "grammar",
  "topic": "verbs_morphology",
  "title": "Trennbare Verben",
  "summary": "Vorsilben, die sich abtrennen, und wo sie im Satz stehen.",
  "brief": {
    "objective": "Trennbare Verben im Hauptsatz und nach einem Modalverb richtig verwenden.",
    "points": [
      "Im Hauptsatz steht die Vorsilbe am Satzende: Ich stehe um sieben Uhr auf.",
      "Nach einem Modalverb bleibt das Verb im Infinitiv zusammen: Ich muss früh aufstehen.",
      "Betont wird die Vorsilbe: AUFstehen, ANrufen, EINkaufen."
    ],
    "examples": [
      "Ich stehe um sieben Uhr auf.",
      "Wann kommst du an?",
      "Kannst du mich morgen anrufen?",
      "Wir kaufen am Samstag ein."
    ],
    "pitfalls": [
      "Fehler: die Vorsilbe im Hauptsatz am Verb lassen (*Ich aufstehe um sieben.*).",
      "Fehler: die Vorsilbe weglassen. *Ich stehe um sieben Uhr.* heißt etwas anderes."
    ]
  }
}
```

</details>

Verdict lines in the PR, one per sampled id:

```text
A1: 12 of 120 sampled, 1 bad
de-separable-verbs: ok
de-family: edited, example "Meine Schwester ist 12 Jahre." is now "Meine Schwester ist 12 Jahre alt."
```

## Done when

- [ ] CI is green: schema, unique ids, brief lengths, no duplicate titles, lessons match the outline, positions checked after seeding.
- [ ] `make` is green with the six German files seeded.
- [ ] The PR lists the sampled ids of each level, each with a verdict.

