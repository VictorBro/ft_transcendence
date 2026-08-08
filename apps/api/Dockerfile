# Build context is the REPO ROOT, not this directory: pnpm resolves workspace:*
# links through the root manifest and the root lockfile.
#
#   docker build -f apps/api/Dockerfile --target prod -t ft/api .
#
# BuildKit reads apps/api/Dockerfile.dockerignore in preference to the context
# root .dockerignore, which is why that file exists next to this one.

# --------------------------------------------------------------------------- base
FROM node:24.18-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# node:*-bookworm-slim ships no libssl. Without it Prisma cannot detect the
# OpenSSL version, silently falls back to openssl-1.1.x (bookworm is 3.x) and
# then fails to load its engine at runtime. ca-certificates is needed for the
# engine download during postinstall.
#
# procps is load-bearing for the dev stage: `nest start --watch` restarts the
# app by tree-killing its child processes, and @nestjs/cli enumerates that tree
# with `ps -A -o pid,ppid`. Without ps the lookup silently returns nothing,
# only the sh wrapper dies, and the orphaned server keeps port 3001 while every
# recompiled instance crashes with EADDRINUSE and hot reload serves stale code.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

# --------------------------------------------------------------------------- deps
# Manifests only, so this layer is invalidated by dependency changes and not by
# source edits. --frozen-lockfile validates every importer the lockfile knows
# about, so a NEW WORKSPACE PACKAGE MUST BE ADDED TO THE COPY LIST BELOW or the
# build fails with "lockfile is not up to date".
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --filter @ft/api...

# --------------------------------------------------------------------------- dev
# Source is bind-mounted over /app at runtime; node_modules stays in the image
# and is masked by a named volume (see compose.override.yml).
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@ft/api", "run", "dev"]

# --------------------------------------------------------------------------- ci
FROM deps AS ci
ENV CI=true
COPY . .
# Build inputs the context cannot carry: one is generated, the other is compiled.
RUN pnpm --filter @ft/api exec prisma generate \
    && pnpm --filter @ft/shared run build
CMD ["sh", "-c", "pnpm --filter @ft/api run lint && pnpm --filter @ft/api run typecheck && pnpm --filter @ft/api run test:cov && pnpm --filter @ft/api run test:e2e"]

# --------------------------------------------------------------------------- build
# prisma generate runs here, inside the target architecture, never copied in
# from a stage built for a different one. Its output (apps/api/generated) is not
# carried into prod yet: nothing imports the client, and tsconfig.build.json
# leaves `generated` out, so there is no compiled JS to ship. Both change
# together the day a PrismaService lands.
FROM deps AS build
COPY . .
RUN pnpm --filter @ft/api exec prisma generate
# The trailing "..." selects @ft/api AND its workspace dependencies, in
# topological order: @ft/shared has to emit its dist before the api can compile
# against it. Packages with no build script are skipped.
RUN pnpm --filter "@ft/api..." run build

# --------------------------------------------------------------------------- prune
# Dropping devDependencies is its own stage on purpose. `prisma` is a
# devDependency, and the Makefile builds its migrate/seed/studio tooling image
# from --target build. Pruning inside `build` would strip the Prisma CLI out of
# the very image that needs it.
FROM build AS prune
# CI=true makes pnpm non-interactive. Switching an existing node_modules to
# --prod means purging it first, and without this pnpm aborts with
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY rather than prompting.
ENV CI=true
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod --filter @ft/api...

# --------------------------------------------------------------------------- prod
# Plain node image rather than `FROM base`: corepack and the pnpm binary have no
# business in a runtime image.
FROM node:24.18-bookworm-slim AS prod
ENV NODE_ENV=production \
    PORT=3001
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# The runtime is `node dist/main.js`; it never shells out to a package manager.
# npm's own bundled dependencies (tar, undici, ip-address, brace-expansion) are
# the only CVE findings this image reports, and they are unfixable from here
# because they belong to the base image, not to pnpm-lock.yaml. Deleting the
# package managers removes the finding class outright.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
# The per-project node_modules is a tree of relative symlinks into the root
# virtual store, so both paths have to come across for resolution to work.
COPY --from=prune --chown=node:node /app/node_modules ./node_modules
COPY --from=prune --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prune --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=prune --chown=node:node /app/apps/api/dist ./apps/api/dist
# apps/api/node_modules/@ft/shared is a relative symlink into packages/shared,
# so the target has to exist here or every import of @ft/shared fails at
# startup with MODULE_NOT_FOUND. Its own node_modules is part of that: it holds
# the symlink to zod, which the compiled schemas require at runtime. The source
# is not needed, only the manifest, the emitted dist and those links.
COPY --from=prune --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=prune --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=prune --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
WORKDIR /app/apps/api
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
