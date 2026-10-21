# #93: feat(content): generate and review the French lesson drafts, A2 to C2

> Text of [issue #93](https://github.com/VictorBro/ft_transcendence/issues/93) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

Generate the French lessons, A2 to C2, from the reviewed outline, with the prompt settled on French A1 (#84). CI checks every file, and a French speaker reviews a sample.

**Needs:** #83 (the script), #90 (the outline), #84 (its prompt, and the A1 file), #79 (its seed, which `make` and the position check need), #117
**Unblocks:** nothing. But the milestone cannot close without it: placement can put a learner at any level up to C2 (the placement API, #71), so every level needs its lessons.

## What to do

- Generate `content/lessons/fr-a2.json` to `fr-c2.json` with `pnpm --filter @ft/api lessons:generate fr <level>`, on the free tier.
- Review a sample of each level: at least 10%, and at least two lessons of each kind. For each lesson, check:
  - the level fits
  - the objective matches the intent
  - the examples are correct, natural French
  - the pitfalls are real
  - vocabulary glosses are short French definitions, never translations
  - the title and summary read naturally
  - nothing is copied
- Fix a bad lesson by editing it in place, or by deleting it and generating it again.
- If more than one sampled lesson in ten is bad: fix the prompt, delete that level's lessons, run the generator again, and sample again.
- Add `fr` to `COMPLETE_LANGUAGES` in `lesson-files.spec.ts`.
- In the AI part of the README's Resources section (fill the TODO there if it is still open), say that the LLM drafted the French lessons, and who reviewed them.

## Examples

<details><summary>Example: one generated lesson in content/lessons/fr-a2.json</summary>

```json
{
  "id": "fr-past-with-avoir",
  "kind": "grammar",
  "topic": "verbs_morphology",
  "title": "Le passé composé avec avoir",
  "summary": "Raconter ce qu'on a fait avec avoir et le participe passé.",
  "brief": {
    "objective": "Former le passé composé avec avoir pour raconter une action terminée.",
    "points": [
      "Avoir au présent, puis le participe passé : j'ai mangé, nous avons parlé.",
      "Les verbes en -er font leur participe en -é : parler, parlé.",
      "Des participes irréguliers à apprendre par cœur : fait (faire), pris (prendre), vu (voir), bu (boire).",
      "À la forme négative, ne... pas entoure l'auxiliaire : je n'ai pas vu ce film."
    ],
    "examples": [
      "Hier, j'ai mangé au restaurant.",
      "Nous avons visité le musée samedi.",
      "Tu as fini tes devoirs ?",
      "Elle n'a pas pris le bus ce matin."
    ],
    "pitfalls": [
      "Erreur : oublier l'auxiliaire (*je mangé* au lieu de j'ai mangé).",
      "Erreur : régulariser un participe irrégulier (*j'ai prendu* au lieu de j'ai pris)."
    ]
  }
}
```

</details>

Verdict lines in the PR, one per sampled id:

```text
A2: 15 of 150 sampled, 1 bad
fr-past-with-avoir: ok
fr-train-travel: edited, the gloss of "le quai" was "platform", now "l'endroit de la gare, le long des voies, où l'on monte dans le train"
```

## Done when

- [ ] CI is green: schema, unique ids, brief lengths, no duplicate titles, lessons match the outline, positions checked after seeding.
- [ ] `make` is green with the six French files seeded.
- [ ] The PR lists the sampled ids of each level, each with a verdict.

