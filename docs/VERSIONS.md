# Pinned Versions

Verified against the npm registry, GitHub releases API, and Docker Hub on **2026-08-01**.
Pin exactly (no caret unless noted) and re-verify before the first commit.

## Runtime and toolchain

| Component | Version | Note |
|---|---|---|
| Node.js | 24.18.1 (`node:24.18-bookworm-slim`) | Active LTS. Node 26 becomes LTS Oct 2026, see trap 3. |
| `@types/node` | `^24.13.3` | Must track Node major 24, not the newest tag. |
| pnpm | 11.18.0 | Via corepack (bundled in Node 24, removed in 25+). Set `packageManager` in root `package.json`. |
| Turborepo | 2.10.8 | |
| TypeScript | **6.0.3** | Not 7.0.2, see trap 1. |
| ESLint | 10.8.0 | |
| typescript-eslint | 8.65.0 | Peer: `typescript >=4.8.4 <6.1.0`. |
| Prettier | 3.9.6 | |

## Application

| Component | Version | Note |
|---|---|---|
| Next.js | 16.2.12 | Node >= 20.9. Turbopack default. `next lint` removed. |
| React / react-dom | 19.2.8 | |
| Tailwind CSS | 4.3.3 | v4: CSS-first config, no `tailwind.config.js`. |
| next-intl | 4.13.4 | |
| NestJS | 11.1.28 | core, common, websockets, platform-socket.io, testing. |
| `@nestjs/swagger` | 11.4.6 | |
| `@nestjs/throttler` | 6.5.0 | |
| `@nestjs/config` | 4.0.4 | |
| socket.io / client | 4.8.3 | `@socket.io/redis-adapter`: pin at scaffold time. |
| Zod | 4.4.3 | |
| nestjs-zod | 5.5.0 | Peers satisfied. |
| argon2 | 0.45.1 | Native addon: needs glibc prebuilds, see Debian note in plan. |
| ioredis | 6.0.0 | |
| BullMQ | 6.0.5 | |
| Prisma / `@prisma/client` | 7.9.1 | Rust-free client is the v7 default. See trap 2. |
| `@prisma/adapter-pg` | 7.9.1 | Mandatory with the Rust-free client, see trap 2. Track the `prisma` version exactly. |

## Infrastructure

| Component | Version |
|---|---|
| Postgres + pgvector | `pgvector/pgvector:0.8.6-pg18-trixie` (PG 18.4, pgvector 0.8.6) |
| Caddy | 2.11.4 |
| Redis | pin at scaffold time |

pgvector must be >= 0.8.2: CVE-2026-3172, buffer overflow in parallel HNSW index builds.
The plain `postgres` image does **not** include pgvector; use the image above.

`CREATE EXTENSION IF NOT EXISTS vector;` belongs in the first migration that needs it. The CI
shadow database replays migrations and nothing else, so an extension created anywhere else leaves
`migrate diff` failing with `42704 type "vector" does not exist`.

## Testing

| Component | Version |
|---|---|
| Vitest | 4.1.10 |
| Playwright | 1.62.1 |
| supertest | 7.2.2 |

## GitHub Actions

From the GitHub releases API. Blog posts still show older majors; trust this table.

| Action | Tag |
|---|---|
| `actions/checkout` | v7.0.1 |
| `actions/setup-node` | v7.0.0 |
| `pnpm/action-setup` | v6.0.9 |
| `docker/setup-buildx-action` | v4.2.0 |
| `docker/setup-qemu-action` | v4.2.0 |
| `docker/login-action` | v4.6.0 |
| `docker/metadata-action` | v6.2.0 |
| `docker/build-push-action` | v7.3.0 |
| `aquasecurity/trivy-action` | v0.36.0 |
| `github/codeql-action/upload-sarif` | v4.37.6 |
| `gitleaks/gitleaks-action` | v3.0.0 |
| `actions/upload-artifact` | v7.0.1 |
| `actions/download-artifact` | v8.0.1 |

`upload-artifact` sharing the `v7.0.1` tag with `checkout` is a coincidence, not a copy-paste
error. Both verified against the releases API.

Trivy runs with `severity: CRITICAL,HIGH` and `ignore-unfixed: true`, and **reports rather than
blocks**: an advisory published after a commit was written would otherwise turn a green PR red
without the diff changing, and would stop the images being pushed at the same time. Results go
to the repository Security tab.

That claim of **0** findings held for OS packages only. Scanned on 2026-08-07 the same flags
reported 8 npm-package findings, all of them from the npm bundled inside `node:24.18-bookworm-slim`
(`tar`, `undici`, `ip-address`, `brace-expansion`). The prod stages of both Dockerfiles now delete
npm, npx, corepack and yarn: the runtime is a bare `node dist/main.js`, so a package manager there
is only attack surface, and the finding class disappears with it. Two further advisories were
genuinely ours and are pinned through `overrides` in `pnpm-workspace.yaml`: `js-yaml` (via
`@nestjs/swagger`) and `sharp` (via `next`).

AI provider SDK: not pinned, provider undecided (plan §6).

---

# Version traps

## 1. TypeScript 7 breaks this stack, pin 6.0.3

npm `latest` is 7.0.2. Two independent blockers:

1. The TS 7 native compiler has no decorator support yet. NestJS cannot compile.
2. typescript-eslint requires `typescript <6.1.0`. Linting breaks.

Pin `"typescript": "6.0.3"` exactly, and assert the resolved version in CI so
`pnpm up --latest` cannot reintroduce 7. Revisit when both blockers clear.

TypeScript **6** has its own migration item, hit while building the skeleton: `rootDir` is no
longer inferred from the common source directory. A config that emitted `dist/main.js` under TS 5
now fails with **TS5011** until `rootDir` is set explicitly. Fixed in `apps/api/tsconfig.build.json`.

## 1b. pnpm 11 removed the build-script allowlist keys

`onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies` and
`ignoreDepScripts` were **removed** in pnpm 11 and replaced by a single `allowBuilds` map of
name to boolean. The old keys are ignored silently, so `@prisma/engines`, `@swc/core` and `sharp`
skip their install scripts and Prisma simply does not work. See `pnpm-workspace.yaml`.

pnpm 11 also defaults `minimumReleaseAge` to 1440 minutes: any version published in the last 24h
is refused, which blunts npm account-takeover attacks. Keep it on. pnpm appends to
`minimumReleaseAgeExclude` on its own when a pin is newer than the window, and it writes those
edits into `pnpm-workspace.yaml`, so commit them rather than reverting.

## 1ba. pnpm `--prod --filter` does not prune the root project

`pnpm install --frozen-lockfile --prod --filter @ft/api...` prunes only the filtered projects.
The root `package.json` devDependencies (turbo, typescript, eslint, prettier) stay, and because
the `.pnpm` virtual store is shared across the workspace, `COPY --from=prune /app/node_modules`
drags them into the runtime image. Measured on the api prod image: 659 MB of node_modules
carrying `prisma` 42 MB, `@prisma/studio-core` 43 MB, `turbo` 37 MB, `@swc/core` 31 MB and
`typescript` 24 MB, none of which the runtime uses.

Also note `pnpm install --prod` over an existing `node_modules` wants to purge it first and
aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in a Docker build. Set `ENV CI=true`
in that stage.

Tracked as an optimisation, not a blocker: the images build and run. `pnpm deploy --filter`
produces a self-contained prod tree and is the intended fix.

## 1c. Prisma CLI needs OpenSSL in slim images, the runtime does not

`node:*-bookworm-slim` ships no libssl and no CA bundle. The Prisma CLI probes for libssl and
warns `failed to detect the libssl/openssl version to use ... Defaulting to "openssl-1.1.x"`, and
the `schema-engine` binary it ships links `libssl.so.3`, so `base` installs
`openssl ca-certificates` for every stage that runs the CLI.

The prod stage needs neither: the runtime is the JS client over `@prisma/adapter-pg` and loads no
engine, and node carries its own CA bundle for outbound TLS.

## 2. The Rust-free Prisma client needs a driver adapter

The `prisma-client` generator emits a client with no query engine of its own, so it cannot talk to
Postgres unaided: `new PrismaClient()` throws at construction with a message pointing at
`@prisma/adapter-pg`. The adapter is a runtime dependency, not a dev one, and its version has to
match `prisma` exactly.

```ts
super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
```

Caught by a unit test rather than in production, which is the argument for `PrismaService` having
a spec at all: with no adapter the failure is at container start, and only the Supertest suite or
a real boot would otherwise have found it.

The generated client is TypeScript, so `output` in `schema.prisma` points inside `src/`: `nest build`
compiles it with everything else, and anything above `rootDir` cannot be emitted into `dist`.

## 3. Node 26 becomes LTS October 2026, mid-project

Stay on 24. Treat the upgrade as a deliberate decision, not a drive-by bump.
Note for then: Node 25+ no longer bundles corepack; pnpm install path changes.
