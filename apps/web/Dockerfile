# syntax=docker/dockerfile:1

# Build context is the REPOSITORY ROOT, not this directory:
#   docker build -f apps/web/Dockerfile --target prod .
# pnpm needs the lockfile and every workspace manifest, all of which live above.
#
# Multi-arch: this file installs and builds inside each target-arch stage. Never
# add a `COPY --from` of node_modules across stages built for another arch.

FROM node:24.18-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app


# --- deps -------------------------------------------------------------------
# Manifests only, so editing a component does not invalidate the install layer.
# All workspace manifests are required: --frozen-lockfile compares the lockfile
# importers against the projects it can see and fails on any mismatch.
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
    pnpm install --frozen-lockfile --filter @ft/web...


# --- dev --------------------------------------------------------------------
# Dependencies live in the image; compose bind-mounts the source over it and
# masks each node_modules path with a named volume. Those volumes start empty
# and hide the layer installed above, so the install has to run again at start.
# It is a no-op once the volume is warm.
FROM deps AS dev
ENV NODE_ENV=development
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["sh", "-c", "pnpm install --frozen-lockfile --filter @ft/web... && pnpm dev"]


# --- ci ---------------------------------------------------------------------
FROM deps AS ci
COPY . .
# A build input the context cannot carry: @ft/shared resolves to dist/, which is
# compiled, and web imports it. Same reason the api ci stage builds it.
RUN pnpm --filter @ft/shared run build
WORKDIR /app/apps/web
CMD ["sh", "-c", "pnpm lint && pnpm typecheck && pnpm test:cov"]


# --- build ------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
# The trailing "..." selects @ft/web AND its workspace dependencies, in
# topological order: @ft/shared resolves to dist/, so it has to emit before
# Next can resolve the import. Packages with no build script are skipped.
RUN pnpm --filter "@ft/web..." run build


# --- prod -------------------------------------------------------------------
# Plain node image rather than `FROM base`: the standalone server is self
# contained, so corepack and pnpm have no business in the runtime image. Matches
# apps/api/Dockerfile. The ENV values base would have supplied are re-declared.
FROM node:24.18-bookworm-slim AS prod
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# The runtime is `node apps/web/server.js`; it never shells out to a package
# manager. npm's own bundled dependencies are the only CVE findings this image
# reports, and they cannot be fixed from pnpm-lock.yaml because they belong to
# the base image. See the same block in apps/api/Dockerfile.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app

# Standalone output mirrors the workspace layout below outputFileTracingRoot,
# so the entrypoint lands at apps/web/server.js. Static assets and public/ are
# not traced and have to be copied separately.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
