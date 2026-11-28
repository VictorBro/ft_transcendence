#!/usr/bin/env bash
#
# schema.prisma and prisma/migrations must say the same thing. They drift the
# moment somebody edits the schema and skips `make migrate-new`, and the cost
# lands on whoever next applies migrations against a database the client no
# longer matches.
#
# The hygiene workflow runs this check; `make ci` did not, so a forgotten
# migration survived a green `make all` and failed in CI instead. This closes
# that gap.
#
# `migrate diff --from-migrations` replays every migration into a throwaway
# database, so that database needs the extensions the real one has (pgvector).
# It is created on the dev postgres rather than a plain image for that reason.
#
#   ./scripts/check-prisma-drift.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

SHADOW_DB=ft_drift_shadow

# .env holds no DATABASE_URL: compose and make build it from POSTGRES_*. Under
# make it is exported already. Run alone, this builds the same one: each key
# from the environment, then .env, then compose's default. .env is read as
# compose reads it, like env_get in the Makefile: an optional `export`, the last
# line wins, a ` #` starts a comment, quotes are not part of the value, and
# neither is the whitespace around it (the Makefile's $(strip)).
env_get() {
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}$1=//p" .env | tail -1 |
    sed 's/[[:space:]]#.*$//' | tr -d "\"'\r" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}
db_user="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
db_user="${db_user:-ft}"
if [ -z "${DATABASE_URL:-}" ]; then
  db_password="${POSTGRES_PASSWORD:-$(env_get POSTGRES_PASSWORD)}"
  db_name="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
  # The compose network inside the devcontainer, the published port elsewhere.
  if [ -f /.dockerenv ]; then
    db_address=db:5432
  else
    db_port="${POSTGRES_HOST_PORT:-$(env_get POSTGRES_HOST_PORT)}"
    db_address="127.0.0.1:${db_port:-5432}"
  fi
  DATABASE_URL="postgresql://$db_user:${db_password:-ft_local_dev}@$db_address/${db_name:-ft_transcendence}?schema=public"
  # prisma.config.ts reads it, and some subcommands reject the empty fallback.
  export DATABASE_URL
fi

# Swap only the database name, keeping any query string: the URL carries
# ?schema=public, and trimming at the last slash would drop it.
base="${DATABASE_URL%%\?*}"
query=''
case "$DATABASE_URL" in *\?*) query="?${DATABASE_URL#*\?}" ;; esac
shadow_url="${base%/*}/${SHADOW_DB}${query}"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  printf 'FAIL  prisma drift: the db service is not running. `make dev` starts it.\n' >&2
  exit 1
fi

psql_postgres() { docker compose exec -T db psql -U "$db_user" -d postgres "$@"; }

# Dropped first: a database left behind by an interrupted run would be replayed
# on top of itself and report a difference that is not in the schema.
# stderr dropped on the first one only: "does not exist, skipping" is the normal
# case and is a NOTICE, not a warning worth printing on every run.
psql_postgres -c "drop database if exists $SHADOW_DB" >/dev/null 2>&1
psql_postgres -c "create database $SHADOW_DB" >/dev/null
trap 'psql_postgres -c "drop database if exists $SHADOW_DB" >/dev/null 2>&1 || true' EXIT

# `cd` rather than `pnpm --filter @ft/api exec`: the filtered form reports the
# child's exit code as its own 1, which loses the difference between 2 (drift,
# the thing being tested for) and 1 (the command itself failed).
diff_prisma() {
  (cd apps/api && SHADOW_DATABASE_URL="$shadow_url" pnpm exec prisma migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema ./prisma/schema.prisma "$@")
}

set +e
diff_prisma --exit-code >/dev/null 2>&1
status=$?
set -e

case "$status" in
  0)
    printf 'ok    prisma: schema.prisma and prisma/migrations agree\n'
    ;;
  2)
    printf 'FAIL  prisma: schema.prisma has changes with no migration.\n' >&2
    printf '      Run `make migrate-new NAME=what_changed` and commit the SQL.\n' >&2
    printf '      The difference:\n' >&2
    diff_prisma --script >&2 || true
    exit 1
    ;;
  *)
    printf 'FAIL  prisma drift: migrate diff exited with %s\n' "$status" >&2
    exit "$status"
    ;;
esac
