# Backlog

Work we have decided on but not done. Nothing here earns a module point; all of it removes
recurring friction or closes a gap a reviewer eventually finds. Each entry states the problem and
the fix, so anyone can pick one up without re-deriving the reasoning.

---

## Open

### 1. Dead light-mode classes outside the pages already cleaned, low

The app is pinned dark: `<html class="dark">`, `color-scheme: dark`, and a `@custom-variant dark`
that follows the class. So in every `border-slate-200 dark:border-slate-800` pair the light half
can never apply.

The pages added by the route-group work were collapsed to the dark value. Still carrying both:
`(main)/login/login-form.tsx`, `(main)/profile/*`, `(main)/settings/2fa/*`,
`(main)/signup/signup-form.tsx`, `components/form.tsx`, `components/legal-article.tsx`. Mechanical,
zero visual change, but ten files of pure restyling wants its own PR.

### 2. Em-dashes in 24 files, cosmetic

Team preference is no em-dashes. The files touched since have been swept; the rest of the repo has
not. Purely mechanical, best done in one commit when nothing else is in flight.

### 3. Squash title setting is inconsistent, low

The repository is set to `COMMIT_OR_PR_TITLE`, so the squash subject is the commit title when a PR
has one commit and the PR title when it has several. That inconsistency is how
`Feat/chat home frontend (#20)` reached `main`. Switching to `PR_TITLE` makes it uniform, and the
`pr title` CI job then guarantees that title is valid. A repository setting, so it needs a team
decision.

A workflow could also auto-normalise a title (`Feat/chat home frontend` to
`feat: chat home frontend`) before merge. Discussed and deferred: the linter is enough for now.

### 4. `next-env.d.ts` flips between dev and build, cosmetic

Next writes `./.next/dev/types/routes.d.ts` into it under `next dev` and
`./.next/types/routes.d.ts` under `next build`, so the file is dirty in git after every switch
between `make dev` and `make`. Next's own docs say to commit it, so gitignoring it is not
obviously right. Low priority, but every teammate will see it and wonder.
