> A French version of this course exists in [../transcendence-course/](../transcendence-course/).

# Course: mastering OUR ft_transcendence

This folder is your revision material. It explains **our** project, the one that is
in this repository, and nothing else. Every important claim points back to the code.

> **What you must know first of all.** Our Transcendence **is not a Pong game**.
> It is a **language-learning platform** (English, French, German):
> an adaptive placement test gives you a CEFR level (A1 → C2), then every day you do
> lessons of four types, with exercises, a timed exam and a score.
> If you remember only one sentence for the jury, make it the architecture one:
> **"NestJS owns all the business logic and data access; Next.js only does
> presentation and server rendering."** (`docs/ARCHITECTURE.md` §1)

---

## Where to start

1. Read [00-COURSE-ROADMAP.md](00-COURSE-ROADMAP.md) (5 min): the order and the time to plan for.
2. Read [01-PROJECT-INTRODUCTION.md](01-PROJECT-INTRODUCTION.md): the big picture.
3. Then follow the modules in the order of the roadmap.
4. Finish each module with its **Self-assessment** section without looking at the answers.
5. When you feel ready, do a mock exam with me (see below).

## The modules

| File | Syllabus module | Jury priority |
|---|---|---|
| [01-PROJECT-INTRODUCTION.md](01-PROJECT-INTRODUCTION.md) | 00 · Introduction | ★★★ |
| [02-TECH-STACK.md](02-TECH-STACK.md) | 01 · Tech stack | ★★★ |
| [03-GLOBAL-ARCHITECTURE.md](03-GLOBAL-ARCHITECTURE.md) | 02 · Global architecture | ★★★ |
| [04-CODEBASE-STRUCTURE.md](04-CODEBASE-STRUCTURE.md) | 03 · Code structure | ★★ |
| [05-FRONTEND.md](05-FRONTEND.md) | 04 · Frontend | ★★★ |
| [06-BACKEND.md](06-BACKEND.md) | 05 · Backend | ★★★ |
| [07-DATABASE.md](07-DATABASE.md) | 06 · Database | ★★★ |
| [08-AUTHENTICATION-AND-SECURITY.md](08-AUTHENTICATION-AND-SECURITY.md) | 07 · Auth and security | ★★★ |
| [09-BUSINESS-FEATURES.md](09-BUSINESS-FEATURES.md) | 08 · Business features | ★★★ |
| [10-REALTIME-AND-COMMUNICATION.md](10-REALTIME-AND-COMMUNICATION.md) | 09 · Real time | ★★★ |
| [11-INFRASTRUCTURE-AND-DEPLOYMENT.md](11-INFRASTRUCTURE-AND-DEPLOYMENT.md) | 10 · Infra and deployment | ★★ |
| [12-END-TO-END-FLOWS.md](12-END-TO-END-FLOWS.md) | 11 · End-to-end flows | ★★★ |
| [13-TESTING-AND-QUALITY.md](13-TESTING-AND-QUALITY.md) | 12 · Testing and quality | ★★ |
| [14-TECHNICAL-DECISIONS.md](14-TECHNICAL-DECISIONS.md) | 13 · Technical decisions | ★★★ |
| [15-ORAL-EXAM-PREPARATION.md](15-ORAL-EXAM-PREPARATION.md) | Oral defense preparation | ★★★ |
| [16-MOCK-EXAM.md](16-MOCK-EXAM.md) | Interactive mock exam | ★★ |
| [17-GLOSSARY.md](17-GLOSSARY.md) | 14 · Glossary | ★ (reference) |
| [18-IMPORTANT-FILES.md](18-IMPORTANT-FILES.md) | The files to know | ★★ (reference) |
| [19-REVISION-CHECKLIST.md](19-REVISION-CHECKLIST.md) | Final checklist | ★★★ |
| [diagrams/](diagrams/) | All the Mermaid diagrams in one place | ★★ |

The file number is offset by 1 from the module number in your request
("Module 00" is the file `01-…`), because `00-` is the roadmap.

## The most important topics

If you are short on time, master these six topics first. They are the ones a jury
digs into, and the ones where our project has original choices to defend:

1. **The architecture rule**: Next.js = presentation, NestJS = business + data,
   and why a single domain (`https://localhost`) behind Caddy removes CORS.
2. **Session-based authentication** (no JWT): httpOnly `ft.sid` cookie, sessions
   in Redis, argon2id, TOTP 2FA, session id regeneration.
3. **The shared contract** `packages/shared`: one Zod schema validates both the form
   and the endpoint; errors are **codes** translated by the browser.
4. **The server-side lesson player**: the server keeps the answers, returns only
   the current page, masks identifiers with HMAC, times the exam, computes the score.
5. **Real time**: Socket.IO on `/ws`, authenticated by the same cookie, rooms
   `user:<id>`, events after commit, presence counted in Redis.
6. **The actual state of the project**: what is finished, what is partial (chat, RAG, 3 lesson
   types out of 4 not playable in the UI). A jury appreciates that you know it. See
   [01 §"Actual state"](01-PROJECT-INTRODUCTION.md#actual-state-of-the-project-what-is-done-and-what-is-not).

## Reliability tags

Every important technical claim carries a tag:

| Tag | Meaning |
|---|---|
| **[CONFIRMED]** | Verified by reading the code or running a command. |
| **[INFERRED]** | Deduced from the code, but not observed directly (e.g. a library's behavior). |
| **[UNVERIFIED]** | Could not be verified in this environment (e.g. no Docker here). |
| **[NOT PRESENT]** | Absent from the project, even if the docs or the UI suggest otherwise. |

What was run to build this course (on 15/11/2026, commit `477b3d4`):

- `pnpm install --frozen-lockfile` then `pnpm run test`: **1,919 green unit tests**
  (api 1,184, shared 435, web 290, ui 10). [CONFIRMED]
- A "dry" run of the seed (`seedLessons` with a fake database): **3,990 lessons**
  in the catalog, **216 ready** (72 per language). [CONFIRMED]
- **No** Docker daemon in this environment: `make`, the API e2e tests
  (Supertest + Postgres + Redis) and Playwright were **not** run here. [UNVERIFIED]

## The Understand Anything graph

The repository now contains `.ua/`: the map produced with the
Understand Anything plugin (see [18-IMPORTANT-FILES.md](18-IMPORTANT-FILES.md#the-understand-anything-graph)).
It is an exploration tool; **the course itself relies on the code**, not on the
generated summaries.

The `.ua/` at the repository root is the French graph. An English graph lives in
`docs/transcendence-course-en/.ua/`: it has the same structure as the French graph,
with English summaries.

| Artifact | Content |
|---|---|
| `.ua/knowledge-graph.json` | 1,368 nodes (481 files, 675 functions, 92 classes, 10 tables…), 3,461 edges, 13 layers, 13-step guided tour, in French |
| `.ua/domain-graph.json` | 6 business domains, 12 flows, 29 steps |
| `.ua/fingerprints.json`, `.ua/meta.json`, `.ua/intermediate/scan-result.json` | what is needed for an incremental update (`/understand` after new commits) |

How it was produced (on 15/11/2026, commit `477b3d4`): `/plugin` commands
cannot be used in a cloud session, so the plugin was cloned and built
by hand (`~/.understand-anything-plugin`), then the `/understand --language fr` pipeline
was run phase by phase: scan and imports (plugin scripts), 38 batches analyzed
by `file-analyzer` agents, merge (`merge-batch-graphs.py`), layers, tour and
business graph written from the verified code, validation (0 broken references),
fingerprints. The JSON teaching content (`content/`), the mockups and the brand are
excluded (`.ua/.understandignore`).

To open the dashboard on your machine, with the plugin installed in Claude Code:

```text
/understand-dashboard
```

Or without the plugin, from a built clone of `Egonex-AI/Understand-Anything`
(`pnpm install` then `pnpm --filter @understand-anything/core build`), for the French graph:

```bash
cd understand-anything-plugin/packages/dashboard && GRAPH_DIR=/path/to/ft_transcendence npx vite --host 127.0.0.1
```

and for the English graph:

```bash
cd understand-anything-plugin/packages/dashboard && GRAPH_DIR=/path/to/ft_transcendence/docs/transcendence-course-en npx vite --host 127.0.0.1
```

then open the `http://127.0.0.1:5173/?token=…` URL printed in the terminal
("Structural" view for the layers, "Domain" for the business flows, "Learn" for the tour).
The interactive commands `/understand-chat` and `/understand-explain <file>`
work on this same graph.

## How to revise

- **A comprehension pass**: read a module, open the cited files alongside it.
- **An active pass**: do the mini-exercise, then the self-assessment, then compare.
- **An oral pass**: take the "Possible oral questions" and answer out
  loud, without reading. Time yourself: an oral answer fits in 30 to 60 seconds.
- **The last two days**: [15-ORAL-EXAM-PREPARATION.md](15-ORAL-EXAM-PREPARATION.md)
  and [19-REVISION-CHECKLIST.md](19-REVISION-CHECKLIST.md).

## Running a mock exam with me

Simply write, in a Claude Code session opened on this repository:

```text
Run a level 2 mock exam following docs/transcendence-course-en/16-MOCK-EXAM.md
```

I will ask **a single question**, wait for your answer, grade it (what is
right, what is wrong, the ideal answer, what to review), then move on to the
next one. You can specify a topic: "level 3, real time only".
