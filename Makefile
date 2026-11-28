# ft_transcendence
#
# `make` (= make all) is the ONE command everyone runs, constantly, and before
# every commit: every check CI runs natively (format, lint, typecheck, unit
# tests with coverage thresholds, builds, Supertest e2e), then the production
# stack (build, up, migrate, seed, certs), then Playwright against it on
# Chromium, console gate included. CI also runs Firefox and WebKit, and so does
# `make playwright-all`: run it before a PR that touches the UI. Every test runs
# on the fixture tutor with no key, so no step spends the LLM key, and Prometheus
# proves it before the end (llm-spend-check); it then leaves the app running
# with the provider .env names. Run it inside the devcontainer: on a host shell
# most targets refuse (check-devcontainer below).
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
STUDIO_PORT  ?= 5555
REDIS_UI_PORT ?= 5540
REPORT_PORT  ?= 9323
# Matches identity() in e2e/support/session.ts, so the suite can clear the
# accounts it signs up afterwards.
E2E_EMAIL_PREFIX ?= browser-

# Where Playwright points its browser. Inside the devcontainer caddy's
# published ports live on the HOST, so the suite talks to the caddy service
# name over the shared compose network instead; the Caddyfile lists `caddy` as
# a site address for exactly this. /.dockerenv exists only inside a container.
E2E_BASE_URL ?= $(if $(wildcard /.dockerenv),https://caddy,$(PUBLIC_URL))

# The engines `make playwright` runs. Chromium alone by default: three engines on
# one stack were most of a `make all`, and CI runs all three anyway, each in its
# own jobs. `make playwright-all` runs the three here.
BROWSERS ?= chromium

# Hosts the natively run tests reach the stores on. Inside the devcontainer they
# are on the compose network and resolve by service name; from a host shell only
# through the loopback ports compose.override.yml publishes.
IN_CONTAINER := $(wildcard /.dockerenv)
DB_HOST    := $(if $(IN_CONTAINER),db,127.0.0.1)
REDIS_HOST := $(if $(IN_CONTAINER),redis,127.0.0.1)

# Make does not read .env, so pull the two host ports out of it. A value already
# in the environment wins. Read at each use, not once at parse time: env-file
# may create .env, or fill its SESSION_SECRET, after make has started.
# Parsed as compose reads it, like env_get in .devcontainer/initialize.sh: an
# optional `export`, the last line wins, a ` #` starts a comment, and quotes
# are not part of the value. Otherwise make would build a DATABASE_URL with
# another password than the one compose gave the db.
env_get = $(strip $(shell sed -n 's/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}$(1)=//p' .env 2>/dev/null | tail -1 | sed 's/[[:space:]]\#.*$$//' | tr -d "\"'\r"))
POSTGRES_HOST_PORT ?= $(or $(call env_get,POSTGRES_HOST_PORT),5432)
REDIS_HOST_PORT    ?= $(or $(call env_get,REDIS_HOST_PORT),6379)

# Where a browser on this machine reaches caddy. The port is only spelled out
# when it is not the default: a rootless daemon cannot publish 443, so on a
# school machine .devcontainer/initialize.sh moves it, to 8443 when that is
# free.
HTTPS_PORT  ?= $(or $(call env_get,HTTPS_PORT),443)
PUBLIC_PORT := $(if $(filter-out 443,$(HTTPS_PORT)),:$(HTTPS_PORT))
PUBLIC_URL  := https://localhost$(PUBLIC_PORT)

# Standard ports on the compose network, published ports from a host shell. A
# wrong port here connects to another database instead of failing.
DB_PORT    := $(if $(IN_CONTAINER),5432,$(POSTGRES_HOST_PORT))
REDIS_PORT := $(if $(IN_CONTAINER),6379,$(REDIS_HOST_PORT))

# The database, as compose.yml builds the api's DATABASE_URL: POSTGRES_* from the
# shell, then .env, then compose's defaults. .env holds no DATABASE_URL, so the
# password lives in one place. Read once, at parse time: env-file only ever
# writes the template's values, which are these defaults. := so the exported
# DATABASE_URL below runs no sed on every recipe line.
PG_USER     := $(or $(POSTGRES_USER),$(call env_get,POSTGRES_USER),ft)
PG_PASSWORD := $(or $(POSTGRES_PASSWORD),$(call env_get,POSTGRES_PASSWORD),ft_local_dev)
PG_DB       := $(or $(POSTGRES_DB),$(call env_get,POSTGRES_DB),ft_transcendence)
pg_url       = postgresql://$(PG_USER):$(PG_PASSWORD)@$(1)/$(PG_DB)?schema=public

# Exported so `pnpm test` and the Supertest suite see them without every recipe
# repeating them. Existing values from the shell win.
# SESSION_SECRET reaches every compose command too, and compose prefers the
# shell over .env: so it takes the value .env holds, which env-file generates,
# and falls back to the dev value only when .env has none.
DATABASE_URL ?= $(call pg_url,$(DB_HOST):$(DB_PORT))
REDIS_URL    ?= redis://$(REDIS_HOST):$(REDIS_PORT)
SESSION_SECRET ?= $(or $(call env_get,SESSION_SECRET),dev-only-session-secret-change-me-at-least-32-chars)
# The `source` label on this stack's alerts, so a Discord alert from a laptop
# names whose: `local (<git user.name>)`, unless .env sets ALERT_SOURCE.
ALERT_SOURCE ?= $(or $(call env_get,ALERT_SOURCE),local ($(or $(shell git config user.name 2>/dev/null),unknown)))
export DATABASE_URL REDIS_URL SESSION_SECRET ALERT_SOURCE

# The tooling container runs ON the compose network, so its database is db:5432
# whatever DB_HOST says: migrate, seed and studio export that URL instead, which
# also beats the one a parent make exported. .env goes in for the seed's
# DEMO_PASSWORD, and DATABASE_URL after it, from the environment and never argv,
# which `ps` shows every local user: a later -e wins over --env-file, so a
# DATABASE_URL line left in an old .env never reaches the container. Without a
# .env, the compose defaults apply, which is what CI and a fresh clone use.
DB_ENV = $(if $(wildcard .env),--env-file .env) -e DATABASE_URL
migrate seed studio: export DATABASE_URL = $(call pg_url,db:5432)

.PHONY: all run dev up build down logs ps shell test test-e2e playwright playwright-all lint format typecheck report \
        migrate migrate-new seed db-ready studio redis-ui reset-db ci stores-up clean certs tooling-image doctor help \
				check-devcontainer env-file monitoring-up monitoring-check llm-spend-check

# Building on the host uses the wrong Node, the wrong pnpm store and a bind
# mount, so most targets refuse to run there. FT_DEVCONTAINER is set on the
# workspace service in compose.override.yml.
#
# A guard rail, not a boundary: .EXTRA_PREREQS needs GNU Make 4.3, and macOS
# ships 3.81, where it is an ordinary unused variable and nothing fires.
check-devcontainer:
	@if [ "$${FT_DEVCONTAINER:-}" != "true" ]; then \
	  printf 'This target has to run inside the devcontainer.\n' >&2; \
	  printf '  In VS Code: Reopen in Container, then try again.\n' >&2; \
	  printf '  Already inside? The container predates FT_DEVCONTAINER, so rebuild it.\n' >&2; \
	  exit 1; \
	fi

.EXTRA_PREREQS = check-devcontainer

# Exempt: the guard itself, what you run before or without a container, and the
# compose passthroughs that only read state. Those are what you reach for from
# the host exactly when the container is the thing that is broken.
check-devcontainer: .EXTRA_PREREQS :=
clean: .EXTRA_PREREQS :=
help: .EXTRA_PREREQS :=
doctor: .EXTRA_PREREQS :=
down: .EXTRA_PREREQS :=
logs: .EXTRA_PREREQS :=
ps: .EXTRA_PREREQS :=
shell: .EXTRA_PREREQS :=
tooling-image: .EXTRA_PREREQS :=
# .github/workflows/e2e.yml brings the stack up on a plain runner, no
# FT_DEVCONTAINER, and a deployed environment is not a devcontainer either.
migrate: .EXTRA_PREREQS :=
seed: .EXTRA_PREREQS :=
db-ready: .EXTRA_PREREQS :=


# --- the one command ---------------------------------------------------------

## all: every CI check, then the running app, then Playwright against it
# env-file first, here and in run: the sub-makes inherit the SESSION_SECRET this
# make exports, and `?=` never overrides the environment, so it must already be
# the generated one.
# The stack under test runs the fixture tutor with no key, whatever .env says:
# the browser suite takes placement exams, which make the API generate
# questions, and on a real key that spends its daily quota (20 requests a day on
# a free Gemini key, Nov 2026). Both given on the command line, so they reach
# every sub-make of `run` and, through the environment, compose, which prefers
# the shell over .env: the api container never holds the key. playwright
# refuses a real provider anyway. llm-spend-check then asks Prometheus whether
# anything called the LLM since this make started (ALL_STARTED, := so it is
# read when make reads this file). The last `up` puts the API back on the
# provider .env names, so `make` still ends with the stack you configured.
all: ALL_STARTED := $(shell date +%s)
all: env-file
	@$(MAKE) --no-print-directory ci
	@$(MAKE) --no-print-directory run LLM_PROVIDER=fixture LLM_API_KEY=
	@$(MAKE) --no-print-directory monitoring-check
	@$(MAKE) --no-print-directory playwright
	@$(MAKE) --no-print-directory llm-spend-check SINCE=$(ALL_STARTED)
	@$(MAKE) --no-print-directory up
	@printf '\n  ALL GREEN: checks, build, e2e on Chromium (console gate included) all passed,\n'
	@printf '  on the fixture tutor: Prometheus saw no LLM call during the run.\n'
	@printf '  CI also runs Firefox and WebKit: `make playwright-all` does too, on the fixture as well.\n'
	@printf '  The PRODUCTION stack is now running at $(PUBLIC_URL), on the LLM provider .env names.\n'
	@printf '  `make dev` gets hot reload back, `make down` stops everything.\n'
	@printf '  `make report` opens the Playwright report.\n\n'

# --- the evaluator path ------------------------------------------------------

## run: build, start, migrate, seed, export the root CA (no checks)
run: env-file
	@$(MAKE) --no-print-directory up
	@$(MAKE) --no-print-directory db-ready
	@# certs runs last, not first: Caddy mints its internal CA on first boot, so
	@# there is nothing to export until the stack is up.
	@$(MAKE) --no-print-directory certs
	@printf '\n  ft_transcendence is running:  $(PUBLIC_URL)\n'
	@printf '  API docs:                     $(PUBLIC_URL)/api/docs\n'
	@printf '  Grafana:                      $(PUBLIC_URL)/grafana  (admin, password: grep GRAFANA_ADMIN_PASSWORD .env)\n'
	@printf '  Logs:                         make logs\n\n'

# env-file: compose.prod.yml requires SESSION_SECRET and both Grafana keys,
# which env-file writes into .env (the monitoring section below).
build: env-file ## Build the production images
	$(COMPOSE_PROD) build

# --build, always: `up` against a stale image quietly runs last week's code,
# and with warm BuildKit caches a no-change rebuild costs seconds.
up: env-file ## Build and start the production stack, wait until healthy
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
                   apps/api/dist apps/api/src/generated apps/web/.next

dev: ## Start the development stack: bind-mounted source, hot reload
	@# rmdir drops the empty root-owned leftovers; it refuses non-empty dirs, so
	@# anything real is untouched.
	@for d in $(DEV_MASKED_DIRS); do rmdir "$$d" 2>/dev/null || true; done
	mkdir -p $(DEV_MASKED_DIRS)
	$(COMPOSE_DEV) up -d --build --wait --wait-timeout $(WAIT_TIMEOUT)
	@# `make` leaves the monitoring containers running, restart: unless-stopped
	@# included, and `up` never touches a service behind an inactive profile.
	@# Removed unless monitoring-up asked for them; their volumes stay.
	@$(if $(findstring --profile monitoring,$(COMPOSE_DEV)),:,$(COMPOSE_DEV) --profile monitoring rm -sf $(MONITORING_SERVICES) >/dev/null 2>&1)
	@# Both are idempotent, and both are the reason a fresh clone used to come
	@# up healthy with every login returning 500: the api dev container runs
	@# `prisma generate`, which emits a client and creates zero tables, and
	@# nothing exported Caddy's CA for the browser to trust.
	@$(MAKE) --no-print-directory db-ready
	@$(MAKE) --no-print-directory certs
	@printf '\n  Dev stack up: $(PUBLIC_URL)\n'
	@printf '  The web and api containers reinstall dependencies on start;\n'
	@printf '  follow them with `make logs` until the servers report ready.\n\n'

# Compose matches containers by project label, so these work whichever overlay
# started the stack. The dev file list is used because it is the shorter one.
down: ## Stop the stack, keep the volumes
	@# The workspace service is behind a profile, so it is invisible to compose
	@# unless the profile is named. Doing that from inside the devcontainer would
	@# stop the container running this command, so only the host activates it.
	@# The monitoring profile always: without it the stack `make` started
	@# keeps running and the network cannot be removed.
	@if [ -f /.dockerenv ]; then \
	  $(COMPOSE_DEV) --profile monitoring down --remove-orphans; \
	  echo "  workspace container left running: you are in it"; \
	else \
	  $(COMPOSE_DEV) --profile devcontainer --profile monitoring down --remove-orphans; \
	fi

logs: ## Follow logs, all services or SERVICES="api web"
	$(COMPOSE_DEV) --profile monitoring logs -f --tail=200 $(SERVICES)

ps: ## Show container status
	$(COMPOSE_DEV) ps

shell: ## Shell into a running service: make shell SERVICE=web
	$(COMPOSE_DEV) exec $(SERVICE) sh

# --- monitoring --------------------------------------------------------------

# compose.prod.yml has no fallback for these: Grafana skips an empty GF_
# variable and keeps admin/admin, and the dev SESSION_SECRET in compose.yml is
# public. A value in .env.example would be a secret published in this repo, so
# make writes random ones into .env, once, before anything starts the stack.
# A fresh clone has no .env yet: env-file copies the template first.
# The Grafana keys are not exported to the shell on purpose: compose prefers the
# shell over .env, so an exported empty value would win over the real one.
# SESSION_SECRET is, above, with the value .env holds.
GENERATED_SECRETS := SESSION_SECRET GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY
# Keys the template has dropped and nothing reads any more. env-file deletes
# them, since check-env-example.sh fails on a .env key the template lacks.
# DATABASE_URL: compose and make build it from POSTGRES_* now, and a stale copy
# would still win in `generation:try`, which loads .env itself.
RETIRED_ENV_KEYS := DATABASE_URL
# The services behind the monitoring profile in compose.override.yml.
MONITORING_SERVICES := prometheus alertmanager grafana node-exporter postgres-exporter \
                       redis-exporter blackbox-exporter

env-file: ## Create .env if missing, generate its empty secrets, add new keys, drop retired ones
	@if [ ! -f .env ]; then cp .env.example .env; printf 'env-file: created .env from .env.example\n'; fi
	@# A last line with no newline would swallow the first key appended below.
	@[ -z "$$(tail -c1 .env)" ] || echo >> .env
	@# Set or not is read as env_get reads it, so a CRLF line's \r is no value.
	@# An empty line is filled through a copy, as the retired keys below are.
	@for key in $(GENERATED_SECRETS); do \
	  [ -n "$$(sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}$$key=//p" .env | tail -1 | sed 's/[[:space:]]#.*$$//' | tr -d "\"' \t\r")" ] && continue; \
	  value=$$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n'); \
	  if grep -q "^$$key=" .env; then \
	    tmp=$$(mktemp); \
	    awk -v k="$$key" -v v="$$value" 'index($$0, k "=") == 1 { print k "=" v; next } { print }' .env >"$$tmp" \
	      || { echo "env-file: could not copy .env, left as it was" >&2; rm -f "$$tmp"; exit 1; }; \
	    cat "$$tmp" >.env || { echo "env-file: could not write .env, its full content is in $$tmp" >&2; exit 1; }; \
	    rm -f "$$tmp"; \
	  else \
	    printf '%s=%s\n' "$$key" "$$value" >> .env; \
	  fi; \
	  printf 'env-file: generated %s in .env\n' "$$key"; \
	done
	@# The key name only, never the line: it may hold a password. Written
	@# through, not `sed -i`, which would turn a symlinked .env into a plain
	@# file (initialize.sh writes through it too) and leave the key in the
	@# link's target. mktemp makes the copy readable by its owner only. grep
	@# exits 1 when .env held only that key, 2 on a failed write (a full /tmp).
	@for key in $(RETIRED_ENV_KEYS); do \
	  pattern="^[[:space:]]*(export[[:space:]]+)?$$key="; \
	  grep -qE "$$pattern" .env || continue; \
	  tmp=$$(mktemp); \
	  grep -vE "$$pattern" .env >"$$tmp" || [ $$? -eq 1 ] \
	    || { echo "env-file: could not copy .env, left as it was" >&2; rm -f "$$tmp"; exit 1; }; \
	  cat "$$tmp" >.env || { echo "env-file: could not write .env, its full content is in $$tmp" >&2; exit 1; }; \
	  rm -f "$$tmp"; \
	  printf 'env-file: removed %s from .env: nothing reads it any more\n' "$$key"; \
	done
	@# check-env-example.sh wants every template key in .env, and an existing .env
	@# predates the newer ones: append each missing line as the template has it.
	@# At the end, not in the template's place: align-env.sh does that.
	@added=; \
	for key in $$(sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' .env.example); do \
	  grep -q "^$$key=" .env && continue; \
	  grep -m1 "^$$key=" .env.example >> .env; \
	  printf 'env-file: added %s to .env from .env.example\n' "$$key"; \
	  added=1; \
	done; \
	[ -z "$$added" ] || printf 'env-file: scripts/align-env.sh moves them to their place in the template\n'

# Through `dev`, not a second `up`: that is what creates the masked dirs before
# Docker can plant them root-owned in the repo, migrates and seeds (the
# Learning dashboard reads the bank), and exports the CA.
monitoring-up: env-file ## Dev stack plus Prometheus, Grafana, Alertmanager: https://localhost/grafana
	@$(MAKE) --no-print-directory dev COMPOSE_DEV='$(COMPOSE_DEV) --profile monitoring'
	@printf '\n  Grafana: $(PUBLIC_URL)/grafana  (user admin, password: grep GRAFANA_ADMIN_PASSWORD .env)\n\n'

# The dev file list works on the prod stack too (see down), so `all` uses it.
monitoring-check: ## Every scrape target up, every rule healthy, Alertmanager found
	COMPOSE="$(COMPOSE_DEV) --profile monitoring" ./scripts/check-monitoring.sh

# `all` runs it after the suite, with SINCE at its own start. Alone:
#   make llm-spend-check SINCE=$(date -d '1 hour ago' +%s)
llm-spend-check: ## Fail if Prometheus counted an LLM call since SINCE (epoch seconds)
	COMPOSE="$(COMPOSE_DEV) --profile monitoring" SINCE='$(SINCE)' ./scripts/check-llm-spend.sh

# --- checks ------------------------------------------------------------------

test: ## Unit tests across the workspace
	pnpm run test

# On the fixture tutor with no key, as in `all`, then back to the provider .env
# names. A failed suite stops before that last `up`, so the stack stays the one
# the suite saw; `make up` puts .env's provider back. env-file first, as for
# `all`: the sub-makes inherit the SESSION_SECRET this make exports.
test-e2e: env-file ## Playwright on Chromium against the production stack, on the fixture tutor, then back to .env's
	@$(MAKE) --no-print-directory up LLM_PROVIDER=fixture LLM_API_KEY=
	@$(MAKE) --no-print-directory playwright
	@$(MAKE) --no-print-directory up

# One variable of a service's container, as Docker holds it. Not `compose exec
# printenv`: in the rootful devcontainer the socket is a socat bridge, and an
# exec whose stdin is closed (make < /dev/null, an agent's shell) can end early
# with no output and status 0. inspect is a plain API call. Only the value
# leaves the pipe: the other lines hold the secrets. Empty when the service
# does not run.
service_env = $$({ docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $$($(COMPOSE_DEV) ps -q $(1) 2>/dev/null) 2>/dev/null || true; } | sed -n 's/^$(2)=//p' | tail -1)
api_env = $(call service_env,api,$(1))

# The suite alone, for a caller that has just brought the stack up: `all` gets
# it from `run`, and a second `up` is one more build and health wait.
playwright: ## The browser suite on the stack already up; refuses a real LLM unless E2E_REAL_LLM=1
	@# First, before any browser download: the suite takes placement exams, and
	@# on a real provider their restocks spend the key. Unreadable (no api
	@# running) counts as real. E2E_REAL_LLM=1, on the command line or in the
	@# environment, is the deliberate run on a real key.
	@provider="$(call api_env,LLM_PROVIDER)"; \
	case "$$provider" in \
	  fixture | disabled) ;; \
	  *) if [ "$${E2E_REAL_LLM:-}" = 1 ]; then \
	       printf 'playwright: E2E_REAL_LLM=1: running on LLM_PROVIDER=%s, which spends its key.\n' "$$provider" >&2; \
	     else \
	       printf 'playwright: the api runs LLM_PROVIDER=%s. The suite takes placement exams, and on a real provider\n' "$${provider:-(unreadable: is the stack up?)}" >&2; \
	       printf '  their question restocks spend the key. `make test-e2e` and `make playwright-all` run it on the\n' >&2; \
	       printf '  fixture, then put .env'"'"'s provider back. E2E_REAL_LLM=1 runs it on this api anyway.\n' >&2; \
	       exit 1; \
	     fi ;; \
	esac
	@# Chromium whatever BROWSERS says: the restart run below pins it.
	pnpm --filter @ft/e2e exec playwright install $(sort chromium $(BROWSERS))
	@# The accounts the browser suite signs up are real rows. Removing them keeps
	@# repeated runs from filling the database an evaluator is going to look at.
	@# The prefix is set by identity() in e2e/support/session.ts. RecoveryCode cascades.
	@# stdin from /dev/null so Playwright skips its "To open last HTML report"
	@# hint, which it gates on isTTY. The command it prints only works from e2e/;
	@# `make report` works anywhere.
	@# The Grafana password is the one the container got, not a second parse of
	@# .env: env_get is simpler than compose's parser (quotes, ` #`), so the
	@# container's value is the one the suite must use. Read with service_env,
	@# as every value below. A shell value still wins, as it does for compose.
	@# Through the environment, never argv, which `ps` shows every local user.
	@# The signup, login and discussion limits come from the api container the same way, so
	@# the suite queues to what the api really runs with
	@# (e2e/support/signup-budget.ts). Empty means the default on both sides.
	@# So does the tutor's provider, through api_env as for the guard above: the
	@# two discussion tests that read the fixture tutor's answer skip themselves
	@# on a stack that runs a real one (E2E_REAL_LLM=1). CI runs fixture.
	@# Then the restart run (e2e/tests/restart.spec.ts): it restarts the API of
	@# the production stack once, on Chromium only, since two starts in 15
	@# minutes fire ApiRestarting. It fires anyway after most runs of the callers
	@# that bring the stack up. Their first `up` recreates the api when its image
	@# was rebuilt, so this restart is the second start. With a provider or a key
	@# in .env, `all`, `test-e2e` and `playwright-all` start it three times: on
	@# the fixture, here, and back on .env's provider. Both are expected; on a
	@# laptop the alert reaches Discord only with a webhook set. Only after a
	@# green suite, as in CI: it would overwrite the failed suite's report and
	@# traces.
	@set +e; \
	GRAFANA_ADMIN_PASSWORD="$${GRAFANA_ADMIN_PASSWORD:-$(call service_env,grafana,GF_SECURITY_ADMIN_PASSWORD)}"; \
	export GRAFANA_ADMIN_PASSWORD; \
	SIGNUP_LIMIT_PER_MINUTE="$(call api_env,SIGNUP_LIMIT_PER_MINUTE)"; \
	LOGIN_LIMIT_PER_MINUTE="$(call api_env,LOGIN_LIMIT_PER_MINUTE)"; \
	LLM_DISCUSSION_GLOBAL_PER_MINUTE="$(call api_env,LLM_DISCUSSION_GLOBAL_PER_MINUTE)"; \
	LLM_DISCUSSION_USER_PER_MINUTE="$(call api_env,LLM_DISCUSSION_USER_PER_MINUTE)"; \
	LLM_PROVIDER="$(call api_env,LLM_PROVIDER)"; \
	export SIGNUP_LIMIT_PER_MINUTE LOGIN_LIMIT_PER_MINUTE LLM_DISCUSSION_GLOBAL_PER_MINUTE LLM_DISCUSSION_USER_PER_MINUTE LLM_PROVIDER; \
	E2E_BASE_URL=$(E2E_BASE_URL) pnpm --filter @ft/e2e run test:e2e $(addprefix --project=,$(BROWSERS)) < /dev/null; \
	status=$$?; \
	if [ "$$status" -eq 0 ]; then \
	  E2E_BASE_URL=$(E2E_BASE_URL) pnpm --filter @ft/e2e run test:e2e:restart < /dev/null; \
	  status=$$?; \
	fi; \
	$(COMPOSE_DEV) exec -T db psql -U '$(PG_USER)' -d '$(PG_DB)' \
	  -c "delete from \"User\" where email like '$(E2E_EMAIL_PREFIX)%@example.com';" >/dev/null; \
	exit $$status

# env-file first too: test-e2e inherits the SESSION_SECRET this make exports.
playwright-all: env-file ## test-e2e on Chromium, Firefox and WebKit, as CI runs it
	@$(MAKE) --no-print-directory test-e2e BROWSERS="chromium firefox webkit"

lint: ## ESLint across the workspace
	pnpm run lint

format: ## Rewrite every file with Prettier, and the schema with prisma format
	pnpm run format
	@# Prettier has no Prisma parser, so schema.prisma gets the formatter Prisma
	@# ships instead. Same one the VS Code extension runs on save.
	pnpm --filter @ft/api exec prisma format

typecheck: ## tsc --noEmit across the workspace
	pnpm run typecheck

report: ## Serve the last Playwright report on port 9323 (REPORT_PORT to change)
	@printf '\n  Playwright report: http://127.0.0.1:%s\n' '$(REPORT_PORT)'
	@printf '  In a devcontainer, forward that port from the VS Code Ports panel.\n'
	@printf '  Ctrl+C to stop.\n\n'
	@# --host 0.0.0.0 so a forwarded port reaches it; no browser exists in here to open.
	@set +e; \
	pnpm --filter @ft/e2e exec playwright show-report --host 0.0.0.0 --port $(REPORT_PORT); \
	status=$$?; \
	case $$status in 0|130) exit 0 ;; *) exit $$status ;; esac

doctor: ## Check this machine can build, test and push: run it first on a new clone
	./scripts/check-dev-env.sh

# The api Supertest suite boots the whole Nest graph, and both PrismaService and
# RedisService connect on init, so the stores have to exist. The ci workflow gets
# them from `services:` blocks; this is the local equivalent.
stores-up:
	@$(COMPOSE_DEV) up -d --wait db redis >/dev/null

# env-file first: check-env-example.sh fails on a .env that predates a key, and
# `make` runs this before `up` would have added it.
ci: env-file stores-up ## Everything the ci workflow runs, natively
	./scripts/assert-ts-version.sh
	./scripts/check-env-example.sh
	./scripts/check-monitoring-config.sh
	./scripts/check-app-boundaries.sh
	./scripts/check-prisma-format.sh
	./scripts/check-prisma-drift.sh
	pnpm run ci
	pnpm --filter @ft/api exec prisma migrate deploy
	pnpm --filter @ft/api run test:e2e

# --- database ----------------------------------------------------------------

tooling-image:
	docker build -f apps/api/Dockerfile --target build -t $(TOOLING_IMAGE) .

# Every path that brings a database up goes through here, so no environment
# ends up migrated but with an empty question bank. Both halves are idempotent.
db-ready: ## Apply migrations, then load the question bank
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed

migrate: ## Apply pending Prisma migrations
	@if [ ! -d "$(MIGRATIONS_DIR)" ] || [ -z "$$(ls -A '$(MIGRATIONS_DIR)' 2>/dev/null)" ]; then \
	  printf 'migrate: no migrations in %s yet, nothing to apply.\n' '$(MIGRATIONS_DIR)'; \
	  exit 0; \
	fi; \
	$(MAKE) --no-print-directory tooling-image; \
	docker run --rm --network $(NETWORK) $(DB_ENV) $(TOOLING_IMAGE) \
	  pnpm --filter @ft/api exec prisma migrate deploy

migrate-new: ## Turn schema.prisma changes into a migration: make migrate-new NAME=add_streaks
	@if [ -z "$(NAME)" ]; then \
	  printf 'migrate-new: name the change, e.g. make migrate-new NAME=add_streaks\n' >&2; \
	  exit 1; \
	fi
	@# Writes the SQL and applies it, then regenerates the client, so the next
	@# typecheck already knows about the new columns: Prisma 7's migrate dev no
	@# longer generates. Commit the generated directory under prisma/migrations
	@# with the schema change.
	pnpm --filter @ft/api exec prisma migrate dev --name $(NAME)
	pnpm --filter @ft/api run db:generate

seed: ## Load development data into the database
	$(MAKE) --no-print-directory tooling-image; \
	docker run --rm --network $(NETWORK) $(DB_ENV) $(TOOLING_IMAGE) \
	  pnpm --filter @ft/api run db:seed

studio: ## Prisma Studio (restart it after make/reset-db: db gets a new container)
	@$(MAKE) --no-print-directory tooling-image
	@printf '\n  Prisma Studio: http://127.0.0.1:%s\n\n' '$(STUDIO_PORT)'
	@# Loopback only: Studio gives unauthenticated access to the whole database.
	@# Run prisma directly; `pnpm exec` reports the child's 130 as its own 1.
	@# 130 means SIGINT, i.e. Ctrl+C, which is how you stop a server.
	@set +e; \
	docker run --rm -it --network $(NETWORK) -p 127.0.0.1:$(STUDIO_PORT):5555 \
	  $(DB_ENV) --workdir /app/apps/api $(TOOLING_IMAGE) \
	  ./node_modules/.bin/prisma studio --port 5555 --browser none; \
	status=$$?; \
	case $$status in 0|130) exit 0 ;; *) exit $$status ;; esac

redis-ui: ## RedisInsight on the dev redis: sessions and placement runs, live
	@printf '\n  RedisInsight: http://127.0.0.1:%s\n\n' '$(REDIS_UI_PORT)'
	@# Loopback only, like studio: it reads and deletes any key, unauthenticated.
	@# Nothing is kept between runs; the connection is configured from the env.
	@set +e; \
	docker run --rm -it --network $(NETWORK) -p 127.0.0.1:$(REDIS_UI_PORT):5540 \
	  -e RI_REDIS_HOST=redis -e RI_REDIS_PORT=6379 -e RI_REDIS_ALIAS=ft_transcendence \
	  -e RI_ACCEPT_TERMS_AND_CONDITIONS=true \
	  redis/redisinsight:3.8.0; \
	status=$$?; \
	case $$status in 0|130) exit 0 ;; *) exit $$status ;; esac

reset-db: ## DESTRUCTIVE: drop the database volume and start empty (FORCE=1 to skip the prompt)
	@if [ -z "$(FORCE)" ]; then \
	  printf 'This deletes volume %s and every row in it.\n' '$(PG_VOLUME)'; \
	  printf 'Ctrl-C to abort, Enter to continue: '; \
	  read -r _; \
	fi
	$(COMPOSE_DEV) rm -sf db
	docker volume rm -f $(PG_VOLUME)
	$(COMPOSE_DEV) up -d --wait --wait-timeout $(WAIT_TIMEOUT) db
	@$(MAKE) --no-print-directory db-ready
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
	printf '  add "<server-ip> %s" to /etc/hosts there, import the cert, open https://%s$(PUBLIC_PORT)\n' \
	  "$${CADDY_EXTRA_HOSTNAME:-ft-transcendence.test}" "$${CADDY_EXTRA_HOSTNAME:-ft-transcendence.test}"

# --- housekeeping ------------------------------------------------------------

clean: ## Remove containers, volumes and local build output
	$(COMPOSE_DEV) --profile monitoring down -v --remove-orphans
	rm -rf \
	  apps/*/dist apps/*/.next apps/*/coverage apps/*/.turbo \
	  packages/*/dist packages/*/coverage packages/*/.turbo \
	  apps/api/src/generated \
	  e2e/playwright-report e2e/test-results \
	  .turbo $(CERTS_DIR)

help: ## List every target
	@printf 'ft_transcendence\n\n'
	@printf '  make            all checks + run + e2e: what you run before every commit\n'
	@printf '  make run        launch only (build, up, migrate, seed, certs), no checks\n\n'
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-17s %s\n", $$1, $$2}'
	@printf '\n'
