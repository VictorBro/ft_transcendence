_This project has been created as part of the 42 curriculum by \<login1\>, \<login2\>, \<login3\>, \<login4\>, \<login5\>._

<!-- TODO: replace the placeholders above with the five 42 logins, in the order
     the team agrees. The subject requires this exact italicised first line. -->

# ft_transcendence

An AI-driven platform for learning a foreign language. Learners are placed at a
CEFR level by a short adaptive test, get the daily lessons of a seeded syllabus
for that level, and work through lessons of four kinds (grammar, vocabulary,
functions and reading), each with exercises, an exam and a score.

## Key features

<!-- TODO: keep this in step with what actually ships. -->

- Adaptive placement test that finds a learner's CEFR level and can be retaken
- The daily lessons of a seeded syllabus per level, sized to a daily goal
- About 4,000 lessons, written with Claude Code from a reviewed syllabus and
  checked by validators
- A streak, XP, a daily challenge and achievements
- Friends, direct messages and who is online
- Progress tracking and analytics

---

## Team Information

All five members are **Developers**: everyone implements features, reviews code,
tests their work and documents it. On top of that, each holds a specialised role,
with a second holder so no area stalls when one person is unavailable.

| Member      | Role                            | Responsibilities                                                                                                         |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Bastian** | Product Owner, second Tech Lead | Product vision, backlog, feature priorities, validates completed work, talks to evaluators. Backs up technical decisions |
| **Victor**  | Technical Lead / Architect      | Architecture, stack decisions, code quality, reviews critical changes                                                    |
| **Endrit**  | Project Manager / Scrum Master  | Meetings and planning, progress and deadlines, team communication, risks and blockers                                    |
| **Anaïs**   | second Product Owner            | Shares backlog ownership and feature validation, covers the PO role                                                      |
| **Luca**    | second Project Manager          | Shares coordination and tracking, covers the PM role                                                                     |

## Project Management

<!-- TODO: fill in before the defence. The subject asks all three explicitly. -->

- **How work is organised:** TODO
- **Tools:** GitHub Issues, pull requests, CODEOWNERS review routing
- **Communication:** TODO

---

## Instructions

### Prerequisites

- Docker and Docker Compose
- `make`
- On Windows: WSL2, with the repository on the WSL2 filesystem

Node and pnpm are only needed to run things outside the containers; the versions
are pinned in `.nvmrc` and `package.json`.

### Run it

```bash
cp .env.example .env    # then edit the secrets, see the comments in that file
make                    # checks, build, run, browser tests
```

To get the six demo learners (streaks, results, a finished level), set
`DEMO_PASSWORD` in `.env` before `make`, then sign in as
`demo-anna@example.com` to `demo-felix@example.com` with that password. Every
seed rebuilds them, on development stacks only.

The app is served at <https://localhost>, or at `https://localhost:<HTTPS_PORT>`
on a machine that cannot publish port 443, such as a 42 school computer: `make`
prints the address either way, and how to trust the local TLS certificate. API
documentation is under `/api/docs`. Grafana, with the monitoring dashboards and
alerts, is under `/grafana`: user `admin`, and the password `make` generated is
in `.env` (`grep GRAFANA_ADMIN_PASSWORD .env`).

The lesson tutor and the question generator use Gemini. With the default
`LLM_PROVIDER=fixture` they call nothing: the tutor gives one canned answer and
no question is generated. To use Gemini, create a key at
<https://aistudio.google.com/apikey>, set `LLM_PROVIDER=gemini` and
`LLM_API_KEY=<your key>` in `.env`, then run `make` again. The key goes in
`.env` only, which git ignores. The tutor's rate limits are in `.env.example`.
The project runs on a free key, on which Google may use what learners write to
the tutor to train its models: the Privacy Policy (`/privacy`, section 4) says
so, and moving to a paid key or another vendor means changing it first
(docs/architecture/product.md section 5).

For day-to-day development use `make dev`, which starts the same stack with hot
reload. `make help` lists every target.

### Browser support

The app is tested on desktop Chromium, Firefox and WebKit (the engine behind
Safari): every Playwright suite runs on all three in CI (two jobs and two stacks
per engine) and with `make playwright-all`, except the API restart run
(`e2e/tests/restart.spec.ts`), which restarts the API once and so runs on
Chromium only. `make` runs Chromium alone to stay quick. Run one engine with
`pnpm --filter @ft/e2e run test:e2e --project=firefox`.

Known limits, once the lessons land (#146 to #151):

- **No speech voice, no Listen.** Listen buttons will read text aloud through
  the browser's speech synthesis. A browser or system that offers no voice for
  the language gets no Listen buttons rather than buttons that do nothing.
- **The listening reply in Functions lessons** will show its text under
  **Show the text** instead, so the exercise can still be done without a voice.

- Mobile browsers are not tested.

---

## Technical Stack

| Layer              | Choice                                    | Why                                                                                                                |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Frontend           | Next.js (App Router), React, Tailwind CSS | Server rendering, routing and a component model in one framework                                                   |
| Backend            | NestJS                                    | Dependency injection makes the AI provider mockable, plus guards, validation pipes, WebSocket gateways and Swagger |
| Database           | PostgreSQL with pgvector                  | Relational data and the RAG vector index in one datastore instead of two                                           |
| ORM                | Prisma                                    | Typed queries, and `schema.prisma` doubles as the schema documentation                                             |
| Cache and sessions | Redis                                     | Sessions, rate-limit counters, presence, AI response cache                                                         |
| Proxy              | Caddy                                     | One TLS entry point, one origin, so no CORS and httpOnly cookies just work                                         |
| Contracts          | Zod in `packages/shared`                  | One schema validates both the browser and the server                                                               |
| Tests              | Vitest, Supertest, Playwright             | Units, API integration, browser end to end                                                                         |

Full reasoning in [docs/architecture/overview.md](docs/architecture/overview.md) and
[docs/architecture/product.md](docs/architecture/product.md).

---

## Database Schema

<!-- TODO: diagram plus tables and relations. The model is documented in
     docs/architecture/data-model.md; copy it here as it gets built. -->

TODO

## Features List

<!-- TODO: every implemented feature, what it does, and which member built it. -->

TODO

## Modules

A Major module is worth 2 points and a Minor module 1 point. The subject requires
14 points, and the bonus above them is capped at 5. Each module has its own file
in [docs/modules/](docs/modules/README.md): what the subject asks, how we meet it,
where the code is, how to show it, the tests, and who built it.

| Module                                                                             | Type           | Points |
| ---------------------------------------------------------------------------------- | -------------- | ------ |
| [Framework for frontend and backend](docs/modules/framework.md)                    | Major          | 2      |
| [ORM for the database](docs/modules/orm.md)                                        | Minor          | 1      |
| [Standard user management](docs/modules/user-management.md)                        | Major          | 2      |
| [Complete 2FA](docs/modules/two-factor-auth.md)                                    | Minor          | 1      |
| [User interaction: chat, profiles and friends](docs/modules/user-interaction.md)   | Major          | 2      |
| [Real-time features via WebSockets](docs/modules/websockets.md)                    | Major          | 2      |
| [Complete LLM interface](docs/modules/llm-interface.md)                            | Major          | 2      |
| [Internationalization: 3 languages](docs/modules/i18n.md)                          | Minor          | 1      |
| [Support for 2 additional browsers](docs/modules/browsers.md)                      | Minor          | 1      |
| [Server-Side Rendering](docs/modules/ssr.md)                                       | Minor          | 1      |
| [Advanced search](docs/modules/advanced-search.md)                                 | Minor          | 1      |
| [Gamification](docs/modules/gamification.md)                                       | Minor          | 1      |
| [Monitoring with Prometheus and Grafana](docs/modules/monitoring.md)               | Major          | 2      |
| [CI/CD](docs/modules/custom-ci-cd.md)                                              | Major (custom) | 2      |
| [Cloud deployment with DNS and Let's Encrypt](docs/modules/custom-cloud-deploy.md) | Minor (custom) | 1      |
| **Total**                                                                          |                | **22** |

**22 points claimed, 19 count** (14 required plus the 5-point bonus). The other
3 points are a margin in case a module is not accepted at the evaluation. The
modules we do not claim, and why, are in
[docs/modules/README.md](docs/modules/README.md#not-claimed).

### Custom module: CI/CD (Major, 2 points)

Every change goes through the same automatic path: checks on the pull request,
a merge button locked until they pass and a teammate approves, then images built,
scanned and published, and a server that updates itself. Full file:
[docs/modules/custom-ci-cd.md](docs/modules/custom-ci-cd.md).

- **Why we chose it.** The subject rejects the project for a single console
  warning, a missing legal page or a committed `.env`, and a reviewer cannot see a
  console warning in a diff. Five people push to one repository, and commits are
  graded. The app also runs on a real server, and updating it by hand after each
  merge would be slow and error-prone.
- **The technical challenges.** Images for two processor types (`amd64` and
  `arm64`) built on native runners, without emulation, and tagged once so no
  machine pulls the wrong one. A server that pulls the images itself, so GitHub
  holds no key to the server, and that waits until all images of a release agree
  before it deploys. Tests inside the Dockerfile's `ci` stage, so they run with the
  production image's Node and libraries. A browser suite on three engines, each
  against its own production stack, split so it fits in the time. A single gate
  job that fails unless the whole matrix passed, because GitHub counts a skipped
  job as passed. A security scanner pinned by commit hash after its tags were
  force-pushed to malicious commits in March 2026.
- **The value it adds.** `main` always works: every commit on it after the first
  is a squashed pull request. The rejection rules are tested on every
  change, on the build the evaluator runs. A merge reaches the live site with
  nobody on the server, and every `main` commit has an image to roll back to.
- **Why it deserves its size.** A trivial CI is one workflow that runs the tests.
  This one is 5 workflows, 1 shared action, 10 scripts and 3 git hooks; 41 checks
  on a typical pull request, 19 of them required; a full production stack started
  6 times per run for 3 browser engines; 18 image jobs per push; and a deploy
  agent that handles half-published releases, failed migrations, retries and
  rollback. It has run for the whole project.

### Custom module: cloud deployment with DNS and Let's Encrypt (Minor, 1 point)

The app runs on an Oracle Cloud server under a real domain,
<https://transcendence.dpdns.org>, with a Let's Encrypt certificate that every
browser trusts. A second copy runs at <https://trans.vyantares.ch>, behind another
web server. Full file:
[docs/modules/custom-cloud-deploy.md](docs/modules/custom-cloud-deploy.md).

- **Why we chose it.** The subject asks for HTTPS. On a laptop our certificate
  comes from Caddy's own authority, which each browser must be told to trust; on
  the public server anyone gets a certificate the browser already trusts. A
  public address also lets the team test on real devices, and gives the images
  that CI/CD publishes a place to run.
- **The technical challenges.** A very small server (most likely 1 GB of RAM),
  handled with memory limits on the monitoring services and a swapfile. Let's
  Encrypt's rate limits, handled by making sure DNS resolves before the first start and keeping
  the certificate in a volume. An IP address that can change. A server with no
  checkout of the code, so a standalone compose file that only pulls images, and
  secrets with no defaults. A second host where another web server owns the HTTPS
  ports, so our Caddy becomes a plain HTTP backend that still sees the visitor's
  real address. Monitoring that stays private on a public server.
- **The value it adds.** The evaluator can open the app on any device with a
  trusted certificate. HSTS and the security headers are on every answer, and
  HTTP/3 works. A fresh server needs three files and three commands. Monitoring
  sees real traffic.
- **Why it deserves its size.** It is real infrastructure outside the repo (a
  cloud instance, a firewall, a DNS zone, a trusted certificate), live and
  checkable from outside in a minute, on two hosts that work differently. It is a
  Minor and not a Major because Caddy does the certificate protocol itself, there
  is almost no application code in it, and the automatic build and deploy are
  counted under CI/CD, not twice.

## Individual Contributions

<!-- TODO: per member, what they built, and the challenges they solved. -->

TODO

---

## Resources

<!-- TODO: references used, and a description of how AI was used, for which
     tasks and which parts of the project. The subject requires the AI part
     explicitly, and it is graded. -->

TODO

---

## Contributing

Branching, commit conventions, hooks and the pull request flow are in
[CONTRIBUTING.md](CONTRIBUTING.md).
