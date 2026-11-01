---
name: author-lessons
description: Write the lessons of one level (content/briefs and content/lessons) from its outline, checked by lessons:check until each one validates. Use when asked to write or redo lessons, e.g. /author-lessons de c1, or /author-lessons fr a2 fr-ordering-at-a-cafe fr-greetings.
---

# Author lessons

How a member writes lessons in one Claude Code session (#83). The rules are not here: they are
the validators in `packages/shared/src/lessons/`, and `lessons:check <id> --rules` prints them
with one lesson that passes, the same text `lessons:author` sends to a model. This file says how
to work through a level. The quality bar is `docs/LESSONS.md` section 7: a lesson that passes and
has no gross error is good enough.

## Arguments

`/author-lessons <lang> <level> [id…]`

- Without ids: the next 12 entries of `content/outlines/<lang>-<level>.json` without files, in
  position order (positions 1 to 12 on a new level).
- With ids: those lessons only.
- Skip a lesson whose files already exist (`content/briefs/<id>.json`). To redo one, the user
  deletes its files first; never overwrite.

## Per lesson

Keep the drafts in your scratchpad, one file per lesson: `<scratchpad>/lessons/<id>.json`, shaped
`{"brief":{…}}` then `{"brief":{…},"content":{…}}`. Leave out what the complete step writes
(`--rules` lists it under "How to answer"): every duration and time limit it computes, the
envelope, provenance and scoring.

1. **Read the rules once per kind:** `pnpm --filter @ft/api lessons:check <id> --rules`. It ends
   with the outline entry, the five lessons on each side and the titles already taken.
2. **Write the brief**, then check it:
   `pnpm --filter @ft/api lessons:check <id> --draft <draft>`.
   A vocabulary lesson is its brief: go to step 4 when it passes.
3. **Grammar, functions, reading: write the content** in the same draft, check again.
4. **Repair:** fix every issue the check prints, at most 4 rounds. Still failing: leave the draft,
   note the lesson and its issues for the hand-over, and go on.
5. **Read it once** for gross errors the checks cannot see: the wrong language, nonsense, a wrong
   exam answer, an exam that does not match what the lesson teaches. Fix and check again.
6. **Write it:** add `--write` to the passing check. It writes the completed, formatted files
   into `content/` and refuses if they exist.

Time each lesson (from step 1 to step 6) and keep the times by kind for the hand-over.

## Checks

```bash
pnpm --filter @ft/api lessons:check <id>                         # a written lesson, from content/
pnpm --filter @ft/api test src/lessons/lesson-files.spec.ts      # every lesson file, what CI runs
npx prettier --check content/briefs content/lessons
```

## Handing over

Do not commit unless asked. Report the lessons written, the ones that failed with their issues,
and the time per lesson by kind (`docs/LESSONS.md` section 7 keeps a table of them). A member
without Claude Code follows the same steps with another model, pasting `--rules` into it, or runs
`lessons:author` (section 7).
