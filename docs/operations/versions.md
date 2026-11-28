# Versions

Every version is pinned exactly in the file that uses it: the `package.json` files,
`pnpm-workspace.yaml`, `.nvmrc`, the Dockerfiles, the compose files and the workflows. This page
keeps only what those files cannot say: what has to move together, what is held back and when to
look again, and the lessons a bump should not have to learn twice. Last full review:
**2026-11-15**.

## Moving together

| Change | Also change |
|---|---|
| Node | `.nvmrc`, `engines.node` in the root `package.json`, every `FROM node:` line (`apps/api/Dockerfile` and `apps/web/Dockerfile`, both stages, and `.devcontainer/Dockerfile`), `@types/node` to the same major. Then rebuild the devcontainer. |
| pnpm | `packageManager` and `engines.pnpm` in the root `package.json`, and the three `npm install -g pnpm@` lines. In the app images pnpm 11 silently downloads the `packageManager` version when they differ; the devcontainer workflow and `make doctor` fail instead. CI's `pnpm/action-setup` reads `packageManager`. |
| Prisma | `prisma`, `@prisma/client` and `@prisma/adapter-pg`, always the same version. |
| Next.js | `next` and `@next/eslint-plugin-next`. |
| NestJS | `@nestjs/core`, `common`, `platform-express`, `platform-socket.io`, `websockets` and `testing` at one version, and `multer` and `socket.io` (with `socket.io-client`) at the versions the two platform packages pin: the api imports both directly. |
| Same version everywhere | `react` with `react-dom` and `packages/ui`'s peers; `eslint` in every package and `packages/eslint-config`'s peer; `tailwindcss` with `@tailwindcss/postcss`. |
| Zod | One version in `packages/shared`, `apps/api` and `apps/web`: the validation pipe relies on `instanceof ZodError` across packages. |
| Vitest | `vitest`, `@vitest/coverage-v8` and `vite` (a required peer) in the four packages that test. |
| Playwright | Compare the devcontainer's apt list with `playwright-core`'s `nativeDeps` for debian13. CI needs nothing: it runs the suite in `mcr.microsoft.com/playwright:v<version>-noble` (`scripts/playwright-in-image.sh`), whose tag follows `@playwright/test`, with the runner's Node. |
| Upstream images | `compose.yml`, `compose.deploy.yml` and `compose.deploy.monitoring.yml`: `scripts/check-monitoring-config.sh` fails when caddy, db, redis or an exporter differs. Nothing checks the other copies: pgvector in `ci.yml`, `hygiene.yml` and `docs/architecture/technical-plan.md`, redis in `ci.yml`. |
| Prometheus | `infra/monitoring/prometheus/Dockerfile` and `prometheusVersion` in `infra/monitoring/grafana/provisioning/datasources/datasources.yml`, which Grafana's query builder reads. Nothing checks that they match. |
| GitHub Actions | Tags from each action's releases API, not from blog posts. `aquasecurity/trivy-action` is pinned by commit (76 of its 77 tags were force-pushed to malicious commits in March 2026), with the scanner's `version` set. |

After any bump: `pnpm audit`, `make all`, then `make playwright-all`.

## Held back

1. **TypeScript 6.0.3**, not 7. TypeScript 7 ships no compiler API until 7.1, and
   typescript-eslint (peer `<6.1.0`), `@nestjs/cli` and Next's type check all load it. Pinned
   exactly, overridden in `pnpm-workspace.yaml`, and asserted in CI by
   `scripts/assert-ts-version.sh`, since one `pnpm up --latest` would bring 7 back. Look again
   when TypeScript 7.1 ships its API and typescript-eslint accepts it.
2. **Node 24**, not 26. On Node 26, Next 16.4 splits the inline page data into one script per
   chunk, about 130 times more scripts and 4 times the bytes (vercel/next.js#101343, fixed only
   on canary), and Prisma 7 lists 24 as its newest Node. Move once a stable Next ships the fix.
   pnpm already comes from npm rather than corepack, which Node no longer ships from 25.
3. **NestJS 11**, not 12. nestjs-zod 5.6 still declares Nest `^10 || ^11`
   (BenLorantfy/nestjs-zod#515). Nest 12 also answers unknown paths from a catch-all route, so
   `routeOf` in `apps/api/src/metrics/http-metrics.middleware.ts` would label scanner 404s
   `/api*path` instead of `unmatched`: fix that with the bump. `@nestjs/config` 12 and
   `@nestjs/cli` 12 already run on Nest 11.
4. **Prisma 7**. npm's `latest` tag for `prisma` points at an 8.0 release candidate, so never
   `pnpm up --latest` it. `CHECKPOINT_DISABLE=1` in the api Dockerfile's `base` stage and the devcontainer keeps
   the CLI from advertising that RC (#61).
5. **Prometheus 3.13**, the LTS line (fixes until 2027-07-31), not the newest minor.
6. **pnpm 11**, not 12. pnpm 12 is a native rewrite with stricter settings, and nothing here
   needs it yet. `updateNotifier: false` in `pnpm-workspace.yaml` keeps pnpm from advertising it.

Known and accepted: `pnpm audit` reports advisories in development tools only, `brace-expansion`,
`js-yaml` 4 and `deepmerge` under `@nestjs/cli`'s type-check plugin and `minimatch` under ESLint.
`pnpm audit --prod` still lists `minimatch`, because `packages/eslint-config` declares ESLint's
plugins as its own dependencies. None reaches a prod image: the api image holds only the api's
production dependencies (`pnpm deploy`, in its `prune` stage), and the web image only what Next's
standalone output traces. They are in the tooling image (the api `build` stage), which only
migrates and seeds, and which Trivy does not scan.

## Lessons kept

- **pnpm 11 build scripts.** Only the packages listed in `allowBuilds` (`pnpm-workspace.yaml`) run
  their install scripts. The pnpm 10 keys are ignored without a word, and Prisma then simply does
  not work. pnpm 11 reads nothing but auth and registry settings from `.npmrc`, so there is none.
- **Release age.** pnpm refuses a version younger than 24 hours (`minimumReleaseAge`), which
  blunts npm account takeovers: keep it. When a pin is newer, pnpm writes an exclusion into
  `pnpm-workspace.yaml`; commit it. With `minimumReleaseAgeExcludePrune`, `pnpm add`, `update`
  and `remove` drop an entry once the lockfile no longer has that version.
- **Prisma in slim images.** The CLI needs `openssl` and `ca-certificates` (the `base` stage);
  the runtime does not. The Rust-free client cannot reach Postgres without `@prisma/adapter-pg`,
  a runtime dependency.
- **pgvector.** The plain `postgres` image has no pgvector, hence `pgvector/pgvector`. Never
  below 0.8.2: CVE-2026-3172, a buffer overflow in parallel HNSW index builds. `CREATE EXTENSION IF NOT EXISTS vector` belongs in the first migration that needs it: the CI
  shadow database replays migrations and nothing else.
- **Image sources.** The Prometheus-family images come from ghcr.io, without Docker Hub's
  anonymous limit of 100 pulls per 6 hours that a school NAT shares. Grafana is
  `grafana/grafana`; `grafana/grafana-oss` stopped at 13.0.2. Every image is amd64 and arm64:
  check with `docker buildx imagetools inspect <ref>`.
- **Dev Containers and Bake.** Compose builds through Buildx Bake, which refuses the Dockerfile
  the Dev Containers CLI generates in its temp folder unless a feature makes the CLI pass that
  folder as a build context ("additional privileges requested: --allow=fs.read=..."). The empty
  feature `.devcontainer/features/bake-compat` exists only for that: seen 2026-11 with Compose
  2.39 and 5.6, Buildx 0.38, Dev Containers 0.475. To see whether it is still needed, take its
  entry out of `devcontainer.json` and rebuild the container: if it still builds, delete the
  folder and `devcontainer-lock.json` too.
- **Chosen over the obvious one.** `@prometheus-io/client`, not the deprecated `prom-client` or
  `@willsoto/nestjs-prometheus`, which serves metrics on the public port. `otpauth` (one
  dependency), not `otplib` (six). `qrcode-generator`, not `qrcode`, which pulls `yargs` into the
  runtime image. `redis` (node-redis), because `connect-redis` peers on it. `@types/express` is
  declared because pnpm does not hoist it. postgres_exporter 0.20 renamed metrics, so older
  community dashboards do not match. redis_exporter is a scratch image: no shell, no healthcheck.
- **Trivy reports, never blocks.** An advisory published after a commit would otherwise turn a
  green PR red without the diff changing. The prod stages delete npm, npx, corepack and yarn:
  their bundled packages were the only findings, and the runtime never uses them.
