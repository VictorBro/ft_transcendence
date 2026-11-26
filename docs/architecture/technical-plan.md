# Technical Plan

Status: **adopted**. Written before the scaffold, kept as the record of the infrastructure decisions; where the build differs, this file says so.
Companions: [subject/summary.md](../subject/summary.md) (requirements), [operations/versions.md](../operations/versions.md) (what moves together, what is held back).

Product: **AI-driven foreign language learning platform**. An authored lesson catalogue with
server-scored lessons, adaptive CEFR placement whose question bank an LLM restocks, an LLM tutor
before each lesson exam, and live social features over WebSockets.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js** (App Router) | Framework major module. SSR minor point. `next-intl` for the i18n module. Public pages indexable. |
| Backend | **NestJS** | WebSocket gateways, DI (mockable LLM provider), guards, throttler, Swagger, validation pipes. Module boundaries map onto team members. |
| Database | **Postgres 18 + pgvector** | Relational data. pgvector was chosen for RAG, which was dropped ([modules/README.md](../modules/README.md#not-claimed), "Not claimed"); the extension stays in the image, unused. |
| ORM | **Prisma 7** | Minor module; `schema.prisma` doubles as the README schema doc. |
| Cache / sessions | **Redis** | Sessions, placement runs, the lesson discussion's rate limits, presence. |
| Proxy | **Caddy** | Single TLS entry point (mandatory HTTPS). Same-origin kills CORS; httpOnly cookies just work. Internal CA for dev certs. |
| Real-time | **socket.io** | Presence, live course and friend updates, direct messages. The lesson discussion streams over Server-Sent Events on a REST route instead ([architecture/realtime.md](realtime.md) §4). |
| Monorepo | **pnpm workspaces + Turborepo** | Strict node_modules; cached tasks. |
| Contracts | **Zod in `packages/shared`** | One schema validates frontend and backend (mandatory requirement). |
| Tests | **Vitest, Supertest, Playwright** | Units, API e2e, browser e2e + console gate. |

### The architecture rule

> **NestJS owns all business logic and data access. Next.js does presentation and SSR only.**
> No Prisma client in `apps/web`, no domain logic in server actions.
> Next's server calls NestJS over the internal Docker network.

At defence, "which runtime owns what" must be a one-sentence answer. This rule is it.

---

## 2. Repository layout

```
ft_transcendence/
├── .devcontainer/
│   ├── devcontainer.json          # → ../compose.yml + ../compose.override.yml, service: workspace
│   ├── initialize.sh              # host side, before every open: fits .env to the Docker daemon
│   └── Dockerfile                 # workspace tooling image: node, pnpm, gh, docker CLI
├── .github/
│   ├── workflows/                 # ci.yml · e2e.yml · images.yml · hygiene.yml · devcontainer.yml (§5)
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── web/                       # Next.js, 6-stage Dockerfile
│   └── api/                       # NestJS, the same 6 stages plus `prune`
├── packages/
│   ├── shared/                    # Zod schemas, socket event contracts
│   ├── ui/                        # shared components (the design-system module is not claimed)
│   ├── eslint-config/
│   └── tsconfig/
├── infra/
│   ├── caddy/                     # Caddyfile (local stacks), Caddyfile.prod (deployments)
│   ├── monitoring/                # Prometheus, Alertmanager and Grafana config
│   └── deploy/                    # deploy.sh and its systemd service and timer
├── content/                       # outlines, lesson briefs and files, placement items
├── e2e/                           # Playwright tests
├── scripts/                       # shell scripts that CI and make run
├── docs/
├── compose.yml                    # topology: caddy · web · api · db · redis, plus the monitoring stack
├── compose.override.yml           # dev, auto-loaded: dev targets, bind mounts, workspace service
├── compose.prod.yml               # prod targets, no mounts, restart policies
├── compose.deploy.yml             # deployments: pulls the released images, never builds
├── compose.deploy.proxy.yml       # overlay for a host where another reverse proxy owns 80 and 443
├── Makefile
├── turbo.json · pnpm-workspace.yaml · .env.example · README.md
```

Scaffolding note: `create-next-app` / `nest new` generate standalone projects (own `.git`,
lockfile). Scaffold into a temp dir, move `src/` + app config into `apps/*`, delete the rest.

### NestJS module seams, as built

The plan had seven seams (`auth`, `users`, `lessons`, `assessment`, `ai`, `realtime`,
`common`). The code split them further:

```
apps/api/src/
├── auth/                 # signup, login, sessions, the global AuthGuard, 2FA
├── users/                # profiles, avatars, public profiles, time zone, interface language
├── courses/              # a course per (user, language): goal, level, active course
├── placement/            # the adaptive placement exam, its state in Redis
├── items/                # the spec that checks content/items/
├── question-generation/  # restocking the bank with the LLM
├── lessons/              # catalogue, daily view, search, attempts, discussion, gamification
├── llm/                  # LlmProvider: fixture, gemini, disabled; generateStructured, streamText
├── gateway/              # socket.io on /ws: handshake, screen, rooms
├── friends/  presence/  messages/   # Milestone 3 social features
├── metrics/              # Prometheus registry and the :9464 listener
├── demo/                 # demo learners, seeded on development stacks only
├── throttler/  prisma/  redis/  health/
└── validation.pipe.ts, error-code.filter.ts   # Zod validation, error codes
```

---

## 3. Docker

Both apps use the same stage names; the api adds a `prune` stage between `build` and `prod`:

| Stage | Contents | Used by |
|---|---|---|
| `base` | `node:24.22.3-trixie-slim`, pnpm from npm | |
| `deps` | `pnpm install --frozen-lockfile`, BuildKit cache mounts | |
| `dev` | full deps, source bind-mounted, `pnpm dev` | compose.override |
| `ci` | deps + source, runs tests, emits coverage | the unit tests job in CI (§5) |
| `build` | compiles (Next standalone / Nest dist) | |
| `prod` | runtime only, non-root, tini, HEALTHCHECK | compose.prod, GHCR |

Rules:

- **Debian slim, not Alpine.** Prisma engines + native modules (argon2) on musl/arm64 is a bug
  class we don't want during defence week.
- **Multi-arch:** run `pnpm install` and `prisma generate` inside each target-arch stage. Never
  `COPY --from` node_modules across architectures.
- **node_modules vs bind mounts:** dev services bind-mount source, but dependencies live in the
  image. Mask with a named volume per `node_modules` path and install on container start.
  Without this, host and container dependencies collide (the classic pnpm-in-Docker failure).

### Topology

```
:443 → caddy → /        → web (Next.js)
              → /api /ws → api (NestJS) → postgres+pgvector, redis
```

Only caddy publishes a port; everything else is internal, which the subject explicitly permits.
Database image: `pgvector/pgvector:0.8.7-pg18-trixie` (plain `postgres` has no pgvector).

### Devcontainer

`devcontainer.json`: `dockerComposeFile: ["../compose.yml", "../compose.override.yml"]`,
`service: workspace`, `workspaceFolder: /workspace`.

- The `workspace` service is defined in `compose.override.yml` under `profiles: ["devcontainer"]`,
  built from `.devcontainer/Dockerfile`. Explicitly targeting a profiled service activates its
  profile, so the devcontainer starts it while plain `make dev` skips it.
- The session user depends on the daemon: `user: ${WORKSPACE_USER:-node}` on the service and no
  `remoteUser` in `devcontainer.json`. `.devcontainer/initialize.sh` (the `initializeCommand`, on
  the host) writes `WORKSPACE_USER=root` and the per-user `DOCKER_SOCKET` into `.env` on a rootless
  daemon, where container root is the host user, and moves published ports that cannot be bound.
  On a rootful daemon it changes nothing.
- Set `shutdownAction` deliberately: the default `stopCompose` stops the whole stack (db included)
  when VS Code closes.
- **State survives rebuilds via named volumes** on the workspace service (compose-based
  devcontainers take mounts from the compose file, not from `devcontainer.json`):
  - `claude-state:/home/node/.claude` and env `CLAUDE_CONFIG_DIR=/home/node/.claude`, so Claude
    Code auth, settings, and conversation history all land inside the volume (without the env
    var, `.claude.json` sits in `$HOME` outside it and is lost on rebuild).
  - `shell-history:/commandhistory` with `HISTFILE=/commandhistory/.history`, same idea for
    shell history.
  - `.devcontainer/Dockerfile` must create these dirs owned by the container user, or the
    volumes initialize root-owned and writes fail.
  - Volumes are per developer machine: each teammate keeps their own auth and history.

---

## 4. Makefile

**Bare `make` is the evaluator path**: runs the CI checks, builds prod targets, starts `compose.prod.yml`, migrates,
seeds, then runs the browser tests. That is the graded single command, and it runs the same artifacts the console gate tests.

`make` runs inside the devcontainer (in VS Code: Reopen in Container). On the host, a `check-devcontainer`
guard stops most targets; only the guard itself, `help`, `doctor`, `clean`, the compose passthroughs (`down`,
`logs`, `ps`, `shell`), `tooling-image`, `migrate`, `seed` and `db-ready` are exempt
([Makefile](../../Makefile), `check-devcontainer`).

```
make            # evaluator: CI checks → build (prod) → up → migrate → seed → certs → monitoring-check → Playwright
make dev        # dev stack (compose.override): hot reload, bind mounts
make down / logs / ps / shell
make test / test-e2e / lint / format / typecheck
make migrate / seed / studio / reset-db
make ci         # what CI runs, locally
make clean
```

---

## 5. CI (five workflows)

**Decision, hybrid:** fast checks run natively on runners; anything that executes code runs in
the `ci` Docker stage for environment parity. This keeps the ci stage from the original design
where it matters and keeps feedback fast where it doesn't.

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR, push to `main` | Native: format check, lint, typecheck, TS-version assert (operations/versions.md, held back: TypeScript), apps compile separately, monitoring config. Docker `ci` stage: unit tests + coverage, Supertest e2e (Postgres and Redis run as job services). Then package tests and build. |
| `e2e.yml` | PR, push to `main` | Two jobs per browser (`lesson`, `rest`), each with a prod-target compose up, then Playwright in its own image (browsers and their system packages included): user flows, **console gate**, **legal pages** (`/privacy`, `/terms` return 200 with real content). |
| `hygiene.yml` | PR, push to `main` | gitleaks, commitlint, PR title, `.env.example` drift, fail if `.env` staged, `prisma migrate diff`. |
| `images.yml` | push to any branch; `v*` tags | Multi-arch build on every commit; tags per table below. |
| `devcontainer.yml` | PR touching `.devcontainer/`, `.nvmrc`, `package.json`, `compose.yml`, `compose.override.yml`, `.env.example` | Builds the devcontainer image; Node and pnpm must match the pins; compose starts the workspace service as root and as node; the host preflight fits a rootless daemon. |

### Multi-arch (`images.yml`)

Native runner matrix, not QEMU:

```yaml
strategy:
  matrix:
    image: [api, web, tooling, prometheus, alertmanager, grafana]   # abridged
    platform:
      - { arch: amd64, name: linux/amd64, runner: ubuntu-24.04 }
      - { arch: arm64, name: linux/arm64, runner: ubuntu-24.04-arm }
```

Each job pushes by digest (`cache-from/to: type=gha`, scoped per arch); a final job merges digests
with `docker buildx imagetools create`. `ubuntu-24.04-arm` is free and GA on public repos (4 vCPU);
since Jan 2026 it also works on private repos (2 vCPU). QEMU fallback only needed on GHES or
self-hosted setups. Trivy scans the prod target before push. Auth via built-in `GITHUB_TOKEN`.

### Image tags (`docker/metadata-action`)

Runs on every commit so a broken Dockerfile surfaces immediately, not at merge time.
Trigger is `push` only: PR commits are pushes to a side branch of the same repo, so a separate
`pull_request` trigger would build everything twice.

| Event | Tags |
|---|---|
| Push to a side branch | `<branch>-<shortsha>` |
| Merge to main | `main-<shortsha>`, `latest` |
| Release tag `vX.Y.Z` | `X.Y.Z`, `X.Y`, `X` |

Rules: `latest` tracks main only; `<branch>-<shortsha>` is the immutable pointer for rollbacks
and deploy provenance; releases are semver git tags. `docker/metadata-action` sanitizes `/` in
branch names to `-` (`feat/auth` → `feat-auth-a1b2c3d`). Add a scheduled prune of untagged and
stale branch tags, per-commit pushes accumulate fast.

### PR policy (GitHub ruleset on `main`)

- No direct pushes: everything lands via PR.
- Required status checks, branch up to date: `ci`, `e2e`, `hygiene`, `images` (build).
- **Minimum 1 approving review** from a teammate (CODEOWNERS routes it); approvals dismissed on
  new commits.
- **Coverage is a merge blocker**: vitest `coverage.thresholds` fail the test job under the
  minimum. **60%** lines/functions global; tune per package, ratchet up, never down.
- Conversation resolution required before merge.

### Why these gates

| Gate | Defends |
|---|---|
| Console gate (zero errors/warnings, prod build) | Rejection criterion |
| Legal pages check | Rejection criterion |
| `.env` hygiene | Rejection criterion |
| commitlint + CODEOWNERS + PR template | Graded: commits from all members, clear messages |
| gitleaks | Credentials never leave `.env` |
| Fixture LLM provider in CI | No spend, no flaky tests, no secrets in fork PRs |

---

## 6. Product, AI and data model

Moved out of this plan. The learner journey and the AI provider with its cost controls are in
[architecture/product.md](product.md), and the schema is in [architecture/data-model.md](data-model.md).
The modules we claim and their points are listed in [modules/README.md](../modules/README.md). Each
topic has one home, so the documents cannot disagree.

---

## 7. Build order

1. **Foundation**: pnpm workspace, Turborepo, tsconfig/eslint/prettier packages, Makefile.
2. **Containers**: Dockerfiles, three compose files, Caddy TLS, pgvector image, Redis.
3. **Devcontainer**: workspace service + image, VS Code extensions pinned.
4. **CI**: every workflow green on hello-world before any feature work; then enable the
   `main` ruleset (§5 PR policy) so the rules exist before the first real PR.
5. **Vertical slice**: auth (argon2, httpOnly cookie, guard) → one Prisma model + migration →
   one streaming AI endpoint on `fixture` → one socket.io room (join/leave/reconnect) → Next
   pages consuming all three. The streaming AI endpoint shipped as the lesson discussion,
   [#150](https://github.com/VictorBro/ft_transcendence/issues/150) "feat(api): stream the lesson
   discussion, with error handling and rate limits" (PR #201): Server-Sent Events on
   `POST /api/courses/:lang/lessons/:id/discussion`, `streamText` on the fixture and on Gemini,
   with its window in #151. It streams over SSE, not over the socket ([architecture/realtime.md](realtime.md) §1).
6. **Slice tests**: unit per layer, one Supertest e2e, one Playwright flow, console gate live.
7. **Images**: multi-arch manifest on GHCR.
8. **Handoff**: README skeleton with all mandatory sections, **including the Resources section
   documenting how AI was used and where** (subject requirement; applies to this plan too).
   CONTRIBUTING with branch/PR/commit conventions.

The team clones the slice pattern per feature instead of inventing five different ones.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| `pnpm up --latest` pulls TS 7 | Exact pin + CI version assert (operations/versions.md, held back: TypeScript) |
| Schema and migrations drift apart | CI `migrate diff` on every PR |
| Node 26 LTS lands mid-project | Stay on 24 until a stable Next fixes its Node 26 regression (operations/versions.md, held back: Node) |
| Hydration warnings trip console gate | Gate live from day one; surfaces at the causing commit |
| Slow HMR on bind mounts | Watch during step 5. Fallback: `apps/web` to Vite. **Costs the SSR minor point (22 → 21, still above the 19 that count)**; budget still clears 14. |
| LLM spend | Fixture provider in CI, lessons authored offline, per-learner and global discussion limits, capped answers, see architecture/product.md §5 |
| Uneven commit distribution | CODEOWNERS, required reviews, periodic `git shortlog -sn` |
