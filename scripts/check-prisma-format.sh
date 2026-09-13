#!/usr/bin/env bash
#
# schema.prisma is the one source file Prettier cannot read, so it needs its own
# check. Prisma ships the formatter; this only asks whether the file is already
# in the shape `prisma format` would put it in.
#
# `prisma format` has no --check in 7.9.1, and running it in place would rewrite
# a file the caller did not ask to change. So it formats a copy and diffs, which
# leaves the working tree alone whether the check passes or fails.
#
#   ./scripts/check-prisma-format.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

SCHEMA=apps/api/prisma/schema.prisma

if [ ! -f "$SCHEMA" ]; then
  printf 'FAIL  prisma format: %s does not exist\n' "$SCHEMA" >&2
  exit 1
fi

copy="$(mktemp -t schema.XXXXXX.prisma)"
trap 'rm -f "$copy"' EXIT
cp "$SCHEMA" "$copy"

# --schema takes the copy, so the real file is never written to.
(cd apps/api && pnpm exec prisma format --schema "$copy") >/dev/null 2>&1

if diff -q "$SCHEMA" "$copy" >/dev/null; then
  printf 'ok    prisma: %s is formatted\n' "$SCHEMA"
  exit 0
fi

printf 'FAIL  prisma: %s is not formatted. Run `make format`.\n' "$SCHEMA" >&2
diff -u "$SCHEMA" "$copy" | sed '1,2d' >&2 || true
exit 1
