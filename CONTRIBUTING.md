# Contributing

How work gets from your machine onto `main`. Read once, then keep it open for the
commit and branch conventions until they stick.

---

## The short version

```bash
git checkout main && git pull                 # always branch from current main
git checkout -b feat/placement-ladder         # one topic per branch

# ...work...

make                                          # the gate. green here means green CI
git add -A
git commit -m "feat(api): add the placement ladder"
git push -u origin feat/placement-ladder      # prints a link to open the PR
```

Then open the pull request, either from that link or:

```bash
gh pr create --base main --fill               # --fill reuses your commit as title and body
```

On GitHub:

1. Check the **title** is conventional-commit format. It becomes the commit message on `main`.
2. Wait for the four checks: `ci`, `e2e`, `hygiene`, `images`.
3. Get one approval.
4. **Squash and merge**, then delete the branch.

After review comments:

```bash
# ...make the changes...
make
git add -A
git commit -m "fix(api): address review feedback"
git push                                      # no -u, the branch already tracks
```

Pushing again dismisses the approval, so ask for re-review.

If a hook stops you, it is telling you something CI would have caught in five minutes:

| It says                  | You do                                                       |
| ------------------------ | ------------------------------------------------------------ |
| commitlint errors        | Rewrite the message: `git commit --amend -m "fix(web): ..."` |
| Prettier changed files   | Nothing, it already fixed and re-staged them                 |
| lint or typecheck failed | Fix it, or `make format` if it is only formatting            |

---

## First run on a new machine

```bash
make doctor   # checks this machine can build, test and push
make          # every check, then the running app, then the browser suite
```

`make` is the one command. It runs everything CI runs, natively, then starts the
production stack and drives Playwright against it. Green here means green CI.

Day to day:

| Command       | What it does                                                                              |
| ------------- | ----------------------------------------------------------------------------------------- |
| `make dev`    | Development stack: bind-mounted source, hot reload, migrations applied, TLS cert exported |
| `make`        | Every check, then build, then run, then browser tests. Before every PR                    |
| `make format` | Rewrites everything with Prettier. The answer to "make complains about formatting"        |
| `make down`   | Stops the stack, keeps the data                                                           |
| `make help`   | Every target                                                                              |

### Platform notes

- **Linux, macOS (Intel or Apple Silicon):** nothing special. Images build for
  your architecture.
- **Windows:** work inside **WSL2**, and keep the repository on the WSL2
  filesystem (`~/projects/...`), not on `C:\`. A Windows path bind-mounted into
  Docker Desktop crosses a filesystem boundary and makes hot reload crawl.
- **Everyone:** the devcontainer is the smoothest path. Open the folder in VS
  Code, "Reopen in Container", and the toolchain, extensions and hooks are
  already set up.

---

## Branches

Branch off `main`, one topic per branch:

```
feat/placement-ladder
fix/session-timeout
ci/lint-pr-title
docs/rag-corpus
```

The prefix is the same word list as the commit types below. Nothing enforces
it, but the branch name becomes the default pull request title, and that title
becomes the commit message on `main`, so a good one saves work later.

---

## Commits

[Conventional Commits](https://www.conventionalcommits.org). The full rule set
lives in `.github/commitlint.config.mjs`; the short version:

```
type(optional scope): subject in lower case, no full stop

Optional body, wrapped at 100 characters, explaining why rather than what.
```

Types: `build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `revert`
`style` `test`.

```
feat(api): add the placement ladder
fix(web): stop the locale switcher losing the current route
ci: lint pull request titles against the commit convention
```

Keep the subject under 100 characters, lower case, no trailing period. Commit
messages are graded: the subject asks for commits from every member with clear
messages.

---

## The hooks

`pnpm install` installs them. Nothing to run by hand.

| Hook         | Runs                                                                   | Roughly                     |
| ------------ | ---------------------------------------------------------------------- | --------------------------- |
| `pre-commit` | Prettier on the files you staged                                       | under a second              |
| `commit-msg` | commitlint on your message                                             | instant after the first run |
| `pre-push`   | TypeScript version, `.env` hygiene, app boundaries, lint and typecheck | about four seconds warm     |

They are a fast subset of `make`, not a replacement for it. Two things worth
knowing:

- The **first** `commit-msg` run downloads commitlint into the pnpm store and
  takes a few seconds. Every run after that is instant and works offline.
- `git commit --no-verify` skips them. If you find yourself reaching for it
  regularly, the hook is too slow and that is a bug worth reporting, not a habit
  worth forming.

---

## Pull requests

1. Push the branch and open a PR against `main`.
2. **Give the PR a conventional-commit title.** This matters more than it looks:
   the repository squash-merges, so for any PR with more than one commit the PR
   title becomes the commit message on `main`. A title auto-generated from a
   branch name, like `Feat/chat home frontend`, lands on `main` as an
   ungradeable commit and fails the hygiene workflow after the fact, when the
   only remedy is rewriting a protected branch. CI checks the title for exactly
   this reason.
3. Fill in the template. Say what changed and how you tested it.
4. Wait for the four checks: `ci`, `e2e`, `hygiene`, `images`.
5. Get one approving review. CODEOWNERS routes it.
6. Squash and merge.

Every check must pass and every conversation must be resolved. Approvals are
dismissed when you push again, so ask for re-review after changes.

---

## The checks, and what each one protects

| Check                     | Guards against                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| `format:check`            | A diff full of unrelated whitespace                                            |
| `lint`, `typecheck`       | The obvious class of bug                                                       |
| `test:cov`                | Coverage falling below 60% lines and functions                                 |
| Console gate (Playwright) | Browser console errors, which the subject treats as a rejection criterion      |
| Legal pages check         | Privacy Policy and Terms present with real content, also a rejection criterion |
| `gitleaks`                | A credential reaching the repository                                           |
| `commitlint`, `pr title`  | Commit history nobody can grade                                                |
| `.env` hygiene            | A committed `.env`, and an `.env.example` that has drifted                     |
| `check-app-boundaries.sh` | `apps/web` and `apps/api` compiling each other's source                        |
| `assert-ts-version.sh`    | `pnpm up --latest` quietly reintroducing TypeScript 7                          |
| Prisma drift              | `schema.prisma` and `prisma/migrations` disagreeing                            |

---

## Rules that are not negotiable

- **Never commit a `.env`.** Only `.env.example`, and it carries names, never
  values. A published credential fails the whole project.
- **Never commit an API key**, anywhere, including in documentation or a code
  comment. A key that has been pasted into a chat is already burned: rotate it.
- **`apps/web` never imports from `apps/api`.** Shared contracts go in
  `packages/shared`, which both may import and which imports from neither.
- **NestJS owns business logic and data access. Next.js does presentation and
  SSR.** No Prisma client in `apps/web`.
