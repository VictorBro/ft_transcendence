# ft_transcendence
#
# `make` (= make all) is the ONE command everyone runs, constantly, and before
# every commit: every check CI runs natively (format, lint, typecheck, unit
# tests with coverage thresholds, builds, Supertest e2e), then the production
# stack (build, up, migrate, seed, certs), then Playwright against it, console
# gate included. Green here means green CI, and it leaves the app running.
# It works the same inside the devcontainer and on a host shell.
#
# `make run` is the launch-only slice of that, no checks: what an evaluator
# needs to see the app. `make dev` is the hot-reload development stack.
# Everything else is a helper around one of those three.
#
# `make help` lists every target

SHELL := /usr/bin/env bash
# Recipes are single shells and fail on the first error, so a broken step cannot
# be masked by the exit status of the last line.
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := all

# compose.override.yml loads automatically, so the bare command IS the dev
# stack. Naming any -f file suppresses that, which is what keeps the dev bind
# mounts out of the production overlay.
COMPOSE_DEV  := docker compose
COMPOSE_PROD := docker compose -f compose.yml -f compose.prod.yml

# `name:` in compose.yml. Docker derives resource names from it, so these must
# track that value rather than the directory name.
PROJECT   := ft_transcendence
NETWORK   := $(PROJECT)_ft
PG_VOLUME := $(PROJECT)_pg-data

MIGRATIONS_DIR := apps/api/prisma/migrations
CERTS_DIR      := certs

# The production image installs with --prod, so it carries no Prisma CLI, no
# schema and no migration files. Anything schema-related therefore runs in a
# throwaway container built from the api `build` stage, attached to the compose
# network so it can reach the db service by name.
TOOLING_IMAGE := $(PROJECT)/api-tooling

# Overridable from the command line: make shell SERVICE=web, make logs SERVICES=api
SERVICE      ?= api
SERVICES     ?=
WAIT_TIMEOUT ?= 300

# Where Playwright points its browser. Inside the devcontainer caddy's
# published ports live on the HOST, so the suite talks to the caddy service
# name over the shared compose network instead; the Caddyfile lists `caddy` as
# a site address for exactly this. /.dockerenv exists only inside a container.
E2E_BASE_URL ?= $(if $(wildcard /.dockerenv),https://caddy,https://localhost)

# Hosts the natively run tests reach the stores on. Inside the devcontainer they
# are on the compose network and resolve by service name; from a host shell only
# through the loopback ports compose.override.yml publishes.
IN_CONTAINER := $(wildcard /.dockerenv)
DB_HOST    := $(if $(IN_CONTAINER),db,127.0.0.1)
REDIS_HOST := $(if $(IN_CONTAINER),redis,127.0.0.1)

# Exported so `pnpm test` and the Supertest suite see them without every recipe
# repeating them. Existing values from the shell win.
DATABASE_URL ?= postgresql://ft:ft_local_dev@$(DB_HOST):5432/ft_transcendence?schema=public
REDIS_URL    ?= redis://$(REDIS_HOST):6379
SESSION_SECRET ?= dev-only-session-secret-change-me-at-least-32-chars
export DATABASE_URL REDIS_URL SESSION_SECRET

# DATABASE_URL for the tooling container, which runs ON the compose network and
# therefore always uses the service name. A local .env wins; without one the
# compose defaults apply, which is what CI and a fresh clone use.
DEFAULT_DATABASE_URL := postgresql://ft:ft_local_dev@db:5432/ft_transcendence?schema=public
ifneq ($(wildcard .env),)
DB_ENV := --env-file .env
else
DB_ENV := -e DATABASE_URL='$(DEFAULT_DATABASE_URL)'
endif

.PHONY: all run dev up build down logs ps shell test test-e2e lint format typecheck \
        migrate seed studio reset-db ci stores-up clean certs tooling-image doctor help

# --- the one command ---------------------------------------------------------

## all: every CI check, then the running app, then Playwright against it
all:
	@$(MAKE) --no-print-directory ci
	@$(MAKE) --no-print-directory run
	@$(MAKE) --no-print-directory test-e2e
	@printf '\n  ALL GREEN: checks, build, e2e (console gate included) all passed.\n'
	@printf '  What you commit now will pass CI.\n'
	@printf '  The PRODUCTION stack is now running at https://localhost:\n'
	@printf '  run `make dev` to get hot reload back, `make down` to stop everything.\n\n'

# --- the evaluator path ------------------------------------------------------

## run: build, start, migrate, seed, export the root CA (no checks)
run:
	@$(MAKE) --no-print-directory up
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed
	@# certs runs last, not first: Caddy mints its internal CA on first boot, so
	@# there is nothing to export until the stack is up.
	@$(MAKE) --no-print-directory certs
	@printf '\n  ft_transcendence is running:  https://localhost\n'
	@printf '  API docs:                     https://localhost/api/docs\n'
	@printf '  Logs:                         make logs\n\n'

build: ## Build the production images
	$(COMPOSE_PROD) build

# --build, always: `up` against a stale image quietly runs last week's code,
# and with warm BuildKit caches a no-change rebuild costs seconds.
up: ## Build and start the production stack, wait until healthy
	$(COMPOSE_PROD) up -d --build --wait --wait-timeout $(WAIT_TIMEOUT)

# --- development -------------------------------------------------------------

# Every path compose.override.yml masks with a named volume. Docker creates a
# missing mount point as root, and a root-owned dir in the repo then breaks the
# devcontainer's own builds with EACCES, so they are made here first.
DEV_MASKED_DIRS := node_modules \
                   apps/api/node_modules apps/web/node_modules \
                   packages/eslint-config/node_modules packages/shared/node_modules \
                   packages/tsconfig/node_modules packages/ui/node_modules \
                   e2e/node_modules \
                   apps/api/dist apps/web/.next

dev: ## Start the development stack: bind-mounted source, hot reload
	@# rmdir drops the empty root-owned leftovers; it refuses non-empty dirs, so
	@# anything real is untouched.
	@for d in $(DEV_MASKED_DIRS); do rmdir "$$d" 2>/dev/null || true; done
	mkdir -p $(DEV_MASKED_DIRS)
	$(COMPOSE_DEV) up -d --build --wait --wait-timeout $(WAIT_TIMEOUT)
	@printf '\n  Dev stack up: https://localhost\n'
	@printf '  The web and api containers reinstall dependencies on start;\n'
	@printf '  follow them with `make logs` until the servers report ready.\n\n'

# Compose matches containers by project label, so these work whichever overlay
# started the stack. The dev file list is used because it is the shorter one.
down: ## Stop the stack, keep the volumes
	$(COMPOSE_DEV) down --remove-orphans

logs: ## Follow logs, all services or SERVICES="api web"
	$(COMPOSE_DEV) logs -f --tail=200 $(SERVICES)

ps: ## Show container status
	$(COMPOSE_DEV) ps

shell: ## Shell into a running service: make shell SERVICE=web
	$(COMPOSE_DEV) exec $(SERVICE) sh

# --- checks ------------------------------------------------------------------

test: ## Unit tests across the workspace
	pnpm run test

test-e2e: ## Playwright against the production stack (starts it if needed)
	@$(MAKE) --no-print-directory up
	pnpm --filter @ft/e2e exec playwright install chromium
	E2E_BASE_URL=$(E2E_BASE_URL) pnpm --filter @ft/e2e run test:e2e

lint: ## ESLint across the workspace
	pnpm run lint

format: ## Rewrite every file with Prettier
	pnpm run format

typecheck: ## tsc --noEmit across the workspace
	pnpm run typecheck

doctor: ## Check this machine can build, test and push: run it first on a new clone
	./scripts/check-dev-env.sh

# The api Supertest suite boots the whole Nest graph, and both PrismaService and
# RedisService connect on init, so the stores have to exist. The ci workflow gets
# them from `services:` blocks; this is the local equivalent.
stores-up:
	@$(COMPOSE_DEV) up -d --wait db redis >/dev/null

ci: stores-up ## Everything the ci workflow runs, natively
	./scripts/assert-ts-version.sh
	./scripts/check-env-example.sh
	pnpm run ci
	pnpm --filter @ft/api exec prisma migrate deploy
	pnpm --filter @ft/api run test:e2e

# --- database ----------------------------------------------------------------

tooling-image:
	docker build -f apps/api/Dockerfile --target build -t $(TOOLING_IMAGE) .

migrate: ## Apply pending Prisma migrations
	@if [ ! -d "$(MIGRATIONS_DIR)" ] || [ -z "$$(ls -A '$(MIGRATIONS_DIR)' 2>/dev/null)" ]; then \
	  printf 'migrate: no migrations in %s yet, nothing to apply.\n' '$(MIGRATIONS_DIR)'; \
	  exit 0; \
	fi; \
	$(MAKE) --no-print-directory tooling-image; \
	docker run --rm --network $(NETWORK) $(DB_ENV) $(TOOLING_IMAGE) \
	  pnpm --filter @ft/api exec prisma migrate deploy

seed: ## Load development data into the database
	@if ! grep -q '"db:seed"' apps/api/package.json; then \
	  printf 'seed: apps/api has no "db:seed" script yet, nothing to load.\n'; \
	  printf 'seed: TODO plan step 5, add prisma/seed.ts and the db:seed script.\n'; \
	  exit 0; \
	fi; \
	$(MAKE) --no-print-directory tooling-image; \
	docker run --rm --network $(NETWORK) $(DB_ENV) $(TOOLING_IMAGE) \
	  pnpm --filter @ft/api run db:seed

studio: ## Prisma Studio on http://localhost:5555
	@$(MAKE) --no-print-directory tooling-image
	docker run --rm -it --network $(NETWORK) -p 5555:5555 $(DB_ENV) $(TOOLING_IMAGE) \
	  pnpm --filter @ft/api exec prisma studio --port 5555 --browser none

reset-db: ## DESTRUCTIVE: drop the database volume and start empty (FORCE=1 to skip the prompt)
	@if [ -z "$(FORCE)" ]; then \
	  printf 'This deletes volume %s and every row in it.\n' '$(PG_VOLUME)'; \
	  printf 'Ctrl-C to abort, Enter to continue: '; \
	  read -r _; \
	fi
	$(COMPOSE_DEV) rm -sf db
	docker volume rm -f $(PG_VOLUME)
	$(COMPOSE_DEV) up -d --wait --wait-timeout $(WAIT_TIMEOUT) db
	@$(MAKE) --no-print-directory migrate
	@# The api holds a connection pool against the database that just went away.
	$(COMPOSE_DEV) restart api 2>/dev/null || true

# --- TLS ---------------------------------------------------------------------

certs: ## Export Caddy's local root CA to ./certs
	@mkdir -p $(CERTS_DIR)
	@if ! $(COMPOSE_DEV) ps --status running --services 2>/dev/null | grep -qx caddy; then \
	  printf 'certs: caddy is not running. Start the stack (make up), then rerun.\n'; \
	  exit 0; \
	fi; \
	$(COMPOSE_DEV) cp caddy:/data/caddy/pki/authorities/local/root.crt \
	  $(CERTS_DIR)/ft-local-root.crt; \
	printf 'certs: wrote %s/ft-local-root.crt\n' '$(CERTS_DIR)'; \
	printf 'Trust it in a browser (the first two need NO sudo, fine on school machines):\n'; \
	printf '  Firefox:         Settings > Privacy & Security > Certificates > View > Authorities > Import\n'; \
	printf '  Chrome/Chromium: certutil -d sql:$$HOME/.pki/nssdb -A -t C -n ft-local-root -i %s/ft-local-root.crt\n' '$(CERTS_DIR)'; \
	printf '  Windows (no admin): copy the .crt out of WSL (explorer: \\\\wsl$$\\<distro>\\...), then: certutil -addstore -user Root ft-local-root.crt\n'; \
	printf '  Linux system-wide (sudo): sudo cp %s/ft-local-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates\n' '$(CERTS_DIR)'; \
	printf '  macOS (sudo): sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain %s/ft-local-root.crt\n' '$(CERTS_DIR)'; \
	printf 'From another device (e.g. your laptop, stack on a school computer):\n'; \
	printf '  add "<server-ip> %s" to /etc/hosts there, import the cert, open https://%s\n' \
	  "$${CADDY_EXTRA_HOSTNAME:-ft-transcendence.test}" "$${CADDY_EXTRA_HOSTNAME:-ft-transcendence.test}"

# --- housekeeping ------------------------------------------------------------

clean: ## Remove containers, volumes and local build output
	$(COMPOSE_DEV) down -v --remove-orphans
	rm -rf \
	  apps/*/dist apps/*/.next apps/*/coverage apps/*/.turbo \
	  packages/*/dist packages/*/coverage packages/*/.turbo \
	  apps/api/generated \
	  e2e/playwright-report e2e/test-results \
	  .turbo $(CERTS_DIR)

help: ## List every target
	@printf 'ft_transcendence\n\n'
	@printf '  make            all checks + run + e2e: what you run before every commit\n'
	@printf '  make run        launch only (build, up, migrate, seed, certs), no checks\n\n'
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'
	@printf '\n'
