# #92: feat(content): generate and review the English lesson drafts

> Text of [issue #92](https://github.com/VictorBro/ft_transcendence/issues/92) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

Generate the English lessons, A1 to C2, from the reviewed outline, the same way as #91, with the prompt settled on French A1 (#84). CI checks every file, and a fluent English speaker reviews a sample.

**Needs:** #83 (the script), #89 (the outline), #84 (its prompt), #79 (its seed, which `make` and the position check need), #117
**Unblocks:** nothing. But the milestone cannot close without it: placement can put a learner at any level up to C2 (the placement API, #71), so every level needs its lessons.

## What to do

- Generate `content/lessons/en-a1.json` to `en-c2.json` with `pnpm --filter @ft/api lessons:generate en <level>`, on the free tier.
- Review a sample of each level: at least 10%, and at least two lessons of each kind. For each lesson, check:
  - the level fits
  - the objective matches the intent
  - the examples are correct, natural English
  - the pitfalls are real
  - vocabulary glosses are short English definitions, never translations
  - the title and summary read naturally
  - nothing is copied
- Fix a bad lesson by editing it in place, or by deleting it and generating it again.
- If more than one sampled lesson in ten is bad: fix the prompt, delete that level's lessons, run the generator again, and sample again.
- Add `en` to `COMPLETE_LANGUAGES` in `lesson-files.spec.ts`.
- In the AI part of the README's Resources section (fill the TODO there if it is still open), say that the LLM drafted the English lessons, and who reviewed them.

## Examples

<details><summary>Example: one generated lesson in content/lessons/en-a1.json</summary>

```json
{
  "id": "en-present-simple-he-she-it",
  "kind": "grammar",
  "topic": "verbs_morphology",
  "title": "Present simple: he, she, it",
  "summary": "Add -s to the verb after he, she and it.",
  "brief": {
    "objective": "Use the present simple with he, she and it, adding -s or -es to the verb.",
    "points": [
      "After he, she and it, the verb takes -s: I work, she works.",
      "Verbs ending in -sh, -ch, -ss, -x or -o take -es: he watches, she goes.",
      "Have becomes has: she has a brother."
    ],
    "examples": [
      "She works in a hospital.",
      "My brother lives in London.",
      "He watches TV every evening.",
      "Tom has two cats."
    ],
    "pitfalls": [
      "Mistake: dropping the -s (*She work in a hospital.*).",
      "Mistake: adding -s after I, you, we or they (*They works.*)."
    ]
  }
}
```

</details>

Verdict lines in the PR, one per sampled id:

```text
A1: 12 of 120 sampled, 1 bad
en-present-simple-he-she-it: ok
en-daily-routine: regenerated, the examples used the past simple, above the level
```

## Done when

- [ ] CI is green: schema, unique ids, brief lengths, no duplicate titles, lessons match the outline, positions checked after seeding.
- [ ] `make` is green with the six English files seeded.
- [ ] The PR lists the sampled ids of each level, each with a verdict.

