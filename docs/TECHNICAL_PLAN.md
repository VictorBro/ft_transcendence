# Technical Plan

Status: **proposed**, pending team review.
Companions: [SUBJECT_SUMMARY.md](SUBJECT_SUMMARY.md) (requirements), [VERSIONS.md](VERSIONS.md) (pins + version traps).

Product: **AI-driven foreign language learning platform**. AI-generated learning content,
AI-assessed proficiency levelling, single-player practice, live two-player sessions over WebSockets.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js** (App Router) | Framework major module. SSR minor point. `next-intl` for the i18n module. Public pages indexable. |
| Backend | **NestJS** | WebSocket gateways, DI (mockable LLM provider), guards, throttler, Swagger, validation pipes. Module boundaries map onto team members. |
| Database | **Postgres 18 + pgvector** | RAG needs vector search; pgvector avoids a second datastore. |
| ORM | **Prisma 7** | Minor module; `schema.prisma` doubles as the README schema doc. |
| Cache / sessions | **Redis** | Sessions, presence, the LLM response cache. |
| Proxy | **Caddy** | Single TLS entry point (mandatory HTTPS). Same-origin kills CORS; httpOnly cookies just work. Internal CA for dev certs. |
| Real-time | **socket.io** | One transport for presence, sessions, LLM token streaming. |
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
│   └── Dockerfile                 # workspace tooling image: node, pnpm, gh, docker CLI
├── .github/
│   ├── workflows/                 # ci.yml · e2e.yml · images.yml · hygiene.yml (§5)
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── web/                       # Next.js, 5-stage Dockerfile
│   └── api/                       # NestJS, 5-stage Dockerfile
├── packages/
│   ├── shared/                    # Zod schemas, socket event contracts
│   ├── ui/                        # design system → minor module
│   ├── eslint-config/
│   └── tsconfig/
├── infra/
│   └── caddy/Caddyfile
├── docs/
├── compose.yml                    # topology: caddy · web · api · db · redis
├── compose.override.yml           # dev, auto-loaded: dev targets, bind mounts, workspace service
├── compose.prod.yml               # prod targets, no mounts, restart policies
├── Makefile
├── turbo.json · pnpm-workspace.yaml · .env.example · README.md
```

Scaffolding note: `create-next-app` / `nest new` generate standalone projects (own `.git`,
lockfile). Scaffold into a temp dir, move `src/` + app config into `apps/*`, delete the rest.

### NestJS module seams (one owner each)

```
apps/api/src/
├── auth/          # signup, login, sessions, guards; 2FA/OAuth later
├── users/         # profiles, avatars, friends, presence
├── lessons/       # curriculum, content CRUD
├── assessment/    # level questionnaires, scoring, CEFR mapping
├── ai/            # LlmProvider iface, RAG retrieval, prompts
├── realtime/      # socket.io gateways: session, presence, chat
└── common/        # pipes, filters, interceptors, throttler
```

---

## 3. Docker

Both apps use identical stage names:

| Stage | Contents | Used by |
|---|---|---|
| `base` | `node:24.18-bookworm-slim`, corepack, pnpm | |
| `deps` | `pnpm install --frozen-lockfile`, BuildKit cache mounts | |
| `dev` | full deps, source bind-mounted, `pnpm dev` | compose.override |
| `ci` | deps + source, runs tests, emits coverage | e2e/test jobs in CI (§5) |
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
Database image: `pgvector/pgvector:0.8.6-pg18-trixie` (plain `postgres` has no pgvector).

### Devcontainer

`devcontainer.json`: `dockerComposeFile: ["../compose.yml", "../compose.override.yml"]`,
`service: workspace`, `workspaceFolder: /workspace`.

- The `workspace` service is defined in `compose.override.yml` under `profiles: ["devcontainer"]`,
  built from `.devcontainer/Dockerfile`. Explicitly targeting a profiled service activates its
  profile, so the devcontainer starts it while plain `make dev` skips it.
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

**Bare `make` is the evaluator path**: builds prod targets, starts `compose.prod.yml`, migrates,
seeds. That is the graded single command, and it runs the same artifacts the console gate tests.

```
make            # evaluator: certs → build (prod) → up → migrate → seed
make dev        # dev stack (compose.override): hot reload, bind mounts
make down / logs / ps / shell
make test / test-e2e / lint / format / typecheck
make migrate / seed / studio / reset-db
make ci         # what CI runs, locally
make clean
```

---

## 5. CI (four workflows)

**Decision, hybrid:** fast checks run natively on runners; anything that executes code runs in
the `ci` Docker stage for environment parity. This keeps the ci stage from the original design
where it matters and keeps feedback fast where it doesn't.

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR, push | Native: format check, lint, typecheck, TS-version assert (trap 1). Docker `ci` stage: unit tests + coverage, Supertest e2e (compose db). Then build. |
| `e2e.yml` | PR, push | Prod-target compose up, then Playwright: user flows, **console gate**, **legal pages** (`/privacy`, `/terms` return 200 with real content). |
| `hygiene.yml` | PR, push | gitleaks, commitlint, `.env.example` drift, fail if `.env` staged, `prisma migrate diff`. |
| `images.yml` | push to any branch; `v*` tags | Multi-arch build on every commit; tags per table below. |

### Multi-arch (`images.yml`)

Native runner matrix, not QEMU:

```yaml
strategy:
  matrix:
    include:
      - { platform: linux/amd64, runner: ubuntu-24.04 }
      - { platform: linux/arm64, runner: ubuntu-24.04-arm }
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

Moved to [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md): the learner journey, the module
list and their points, the AI provider and its cost controls, and the schema. One source of
truth, so the two documents cannot disagree.

---

## 7. Build order

1. **Foundation**: pnpm workspace, Turborepo, tsconfig/eslint/prettier packages, Makefile.
2. **Containers**: Dockerfiles, three compose files, Caddy TLS, pgvector image, Redis.
3. **Devcontainer**: workspace service + image, VS Code extensions pinned.
4. **CI**: all four workflows green on hello-world before any feature work; then enable the
   `main` ruleset (§5 PR policy) so the rules exist before the first real PR.
5. **Vertical slice**: auth (argon2, httpOnly cookie, guard) → one Prisma model + migration →
   one streaming AI endpoint on `fixture` → one socket.io room (join/leave/reconnect) → Next
   pages consuming all three.
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
| `pnpm up --latest` pulls TS 7 | Exact pin + CI version assert (VERSIONS.md trap 1) |
| Schema and migrations drift apart | CI `migrate diff` on every PR |
| Node 26 LTS lands mid-project | Stay on 24; deliberate upgrade later (trap 3) |
| Hydration warnings trip console gate | Gate live from day one; surfaces at the causing commit |
| Slow HMR on bind mounts | Watch during step 5. Fallback: `apps/web` to Vite. **Costs the SSR minor point (16 → 15)**; budget still clears 14. |
| LLM spend | Cache, per-user budget and a global ceiling, see PRODUCT_ARCHITECTURE.md §5 |
| RAG scope creep | Fix corpus + chunking before writing retrieval code |
| Uneven commit distribution | CODEOWNERS, required reviews, periodic `git shortlog -sn` |
