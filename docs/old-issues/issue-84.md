# #84: feat(content): generate and review the French A1 lesson drafts

> Text of [issue #84](https://github.com/VictorBro/ft_transcendence/issues/84) before the Milestone 2 replan (#137), saved on 2026-10-21.

## Goal

French A1 is the demo level, and every e2e test runs on it. So its lessons go through the whole pipeline first, on their own: generated from the outline of #105 and read in full. This is also where we tune the generator's prompt, before the other 3,870 lessons use it.

French goes first because most of the team speaks it, so the full read and the second reader are easy to find. The pages and the e2e wait only for these 120 lessons, not for all 1,330 French ones.

**Needs:** #105 (the outline), #79, #83 and #117 
**Unblocks:** #86, #87, #96 (they need seeded lessons on the dev stack), and #91, #92, #93 (they use the prompt settled here).

## What to do

- Generate `content/lessons/fr-a1.json` with `pnpm --filter @ft/api lessons:generate fr a1`.
  - Use a paid key while you work on the prompt.
  - Repeat: generate, read, fix the prompt, delete the lessons, run again.
- A French owner reads every lesson, and checks:
  - the level fits
  - the objective matches the intent
  - the title, summary and examples are correct, natural French
  - the pitfalls are real
  - vocabulary glosses are short French definitions, never translations
  - nothing is copied
- The final prompt from this issue is the one every other level uses. The PR says what changed in the prompt and why.

## Done when

- [ ] `lesson-files.spec.ts` passes for `fr-a1`, and `make` is green with it seeded.
- [ ] The PR says who read every lesson, and what they changed.
- [ ] The first 42 lessons (one week at 60 minutes a day) make sense in order.
- [ ] The PR shows the final prompt and five of the lessons it produced.

