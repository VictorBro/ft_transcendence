---
name: outline-language
description: Write the six lesson outlines (content/outlines/<lang>-a1.json to -c2.json) for one course language, researched, planned, ordered and reviewed the way en (#89) and de (#88) were. Use when asked to outline a language or a level, e.g. /outline-language it.
---

# Outline a course language

How the English and German outlines were written, so the next language follows the same
process. The rules themselves are in `docs/LESSONS.md` (sections 1, 2, 4, 5, 9 and 10). This file
says how to apply them. If `docs/LESSONS.md` is not on your branch yet, read it from the open docs
PR: `git show origin/docs/76-lesson-docs:docs/LESSONS.md`.

## Before starting

1. **The language exists in code.** It is in `LEARNABLE_LANGUAGES` and has a row in `KIND_COUNTS`
   (`packages/shared/src/schemas/lesson.ts`). If not, stop: adding a language is its own PR
   (#77 did it for de, en and fr), and `outlines:check` refuses an unknown language.
2. **Ask the user what only they can decide**, in one question:
   - the standard variety and spelling (for example European or Brazilian Portuguese; German as
     written in Germany with ß; British English);
   - the title conventions per kind in that language, so kinds never collide. The existing ones:
     | Kind       | English                                          | German                                 | French                   |
     | ---------- | ------------------------------------------------ | -------------------------------------- | ------------------------ |
     | grammar    | names the structure: Present simple: he, she, it | Trennbare Verben                       | Le verbe être au présent |
     | vocabulary | noun phrase: Parts of the body                   | Die Familie                            | Les métiers              |
     | functions  | -ing phrase: Asking the way                      | infinitive phrase: Nach dem Weg fragen | infinitive: Se présenter |
     | reading    | Reading a train timetable                        | Einen Fahrplan lesen                   | Lire un SMS              |
   - sources they already trust, if any;
   - who will read every entry, and the second reader (LESSONS.md section 9).
3. **Branch** from main, e.g. `feat/<issue>-<lang>-outlines`.

## The process

Run the saved workflow `outline-language` one phase at a time, and read each phase's result
before starting the next: every phase writes notes the next one reads, and a wrong turn is
cheaper to catch between phases. Pass the same args each time, changing only `phase`:

```js
{
  lang: 'it',
  phase: 'research', // then 'plan', 'assemble', 'review', 'focus'
  workdir: '<your scratchpad>/outlines-it', // absolute; holds research, plan and review notes
  standard: 'Italian as written in Italy',
  conventions: 'grammar names the structure (...); vocabulary ...; functions ...; reading ...',
  sources: 'optional: sources the user named',
}
```

| Phase    | What it does                                                                                                                                             | Check before moving on                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| research | Five agents fetch the level inventories, exam formats, word lists and coursebook order for the language and write notes to `<workdir>/research/`         | Which parts were fetched and which are the model's own knowledge                        |
| plan     | Ten planners write every entry by kind across all six levels, so nothing repeats between levels; a checker then fixes overlaps, gaps and level misfits   | `merge-plan.mjs` then `outlines:check` on `plan/merged` prints ok; read `plan/CHECK.md` |
| assemble | One agent per level orders its entries so each builds on the ones before, polishes them and writes `content/outlines/<lang>-<level>.json`                | `outlines:check <lang>` prints ok; read the first 42 A1 titles                          |
| review   | Per level, a curriculum reviewer and a native-speaker editor; a skeptic verifies their findings and applies the real ones; then a pass across all levels | All checks below pass                                                                   |
| focus    | Scans for lessons that combine two unrelated focuses and narrows them (the English review missed one; Copilot caught it on #119)                         | All checks below pass                                                                   |

## Checks

```bash
pnpm --filter @ft/api outlines:check <lang>                  # all six files: counts, ids, titles, style
pnpm --filter @ft/api outlines:check <lang> --level B1       # only problems in de-b1.json
pnpm --filter @ft/api test src/lessons/outline-files.spec.ts # what CI runs
npx prettier --check content/outlines/
```

## Rules the agents follow

These are what the reviews kept catching on en and de. The workflow puts them in every prompt.

- **Ids:** `<lang>-` plus English words, no digits, no level, specific enough to stay unique
  across 1,330 lessons. Keep any ids the issue's example uses.
- **Text:** at most 80 characters for the title and 200 for the intent, in the course language;
  no em or en dashes, no quotation marks (French may keep « »), no double spaces.
- **One focus per lesson,** sized to ten minutes: about 3 grammar statements or 12 to 15 words.
  Two uses of one form are two lessons unless the contrast is the point.
- **Nothing used before it is taught,** above all in A1: an example word or structure in an intent
  must come from an earlier lesson, except fixed phrases in function lessons.
- **No two entries teach the same thing,** across all levels and kinds. A spiral point returns with
  a named slice. Grammar owns structures, vocabulary owns word sets, word formation and idioms,
  functions own communicative tasks, reading owns understanding a kind of text.
- **Gendered languages:** every noun in a vocabulary intent has its article.
- **Copyright:** nothing copied from an inventory, word list, course or test (LESSONS.md section 10).

## Handing over

Do not commit unless asked. The PR description names who read every entry and
the second reader (both TODO until people have done it), the standard chosen, and the
judgement calls the reviews left open. An LLM draft is only a draft: LESSONS.md section 9 still
needs the human readers.
