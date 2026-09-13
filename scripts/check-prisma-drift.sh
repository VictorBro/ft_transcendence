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

# Prisma reads .env itself, this script has to parse it to build the shadow URL.
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
fi
if [ -z "$DATABASE_URL" ]; then
  printf 'FAIL  prisma drift: no DATABASE_URL in the environment or .env\n' >&2
  exit 1
fi

db_user="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
db_user="${db_user:-ft}"

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
