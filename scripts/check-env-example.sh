#!/usr/bin/env bash
#
# .env hygiene. A committed .env is a subject rejection criterion, and an
# .env.example that has drifted from what the stack actually reads is the usual
# way a teammate ends up with a half-configured container and no error message.
#
# Four checks, all on variable NAMES only. Values are never read, never printed,
# never compared: this script must be safe to run against a real .env.
#
#   1. .env is neither tracked nor staged.
#   2. .env, when present, declares exactly the keys .env.example declares.
#   3. Every ${VAR} a compose file interpolates is documented in .env.example,
#      and every key in .env.example is interpolated by a compose file.
#   4. Every process.env.X read in source is either documented in .env.example
#      or injected directly by compose (see RUNTIME_INJECTED below).
#
#   ./scripts/check-env-example.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

EXAMPLE_FILE=".env.example"
ENV_FILE=".env"
COMPOSE_FILES=(compose.yml compose.override.yml compose.prod.yml)

# Read from source but never supplied through .env: compose.yml sets these on
# the service directly, or the container runtime provides them. Adding a name
# here is a deliberate statement that it is not a user-configurable variable.
RUNTIME_INJECTED=(
  CI
  HOSTNAME
  NEXT_TELEMETRY_DISABLED
  NODE_ENV
  PORT
  TZ
  # Set by .github/workflows/e2e.yml, never by .env: the suite targets whatever
  # host the workflow brought up.
  E2E_BASE_URL
)

failures=0

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'ok    %s\n' "$1"
}

# Every extractor below ends in `|| true`: grep exits 1 on "no match", and under
# `set -o pipefail` that would abort the script on a file that legitimately
# contains none of what we are looking for (compose.prod.yml has no ${VAR}).

# Newline-separated set, empty when the variable is empty. Feeding a bare
# `printf '%s\n' "$empty"` to comm would inject a phantom empty element.
print_set() {
  [ -n "$1" ] && printf '%s\n' "$1"
  return 0
}

# Variable names from a dotenv file: `NAME=` at the start of a line, with an
# optional `export `. Comments and blank lines drop out on their own.
dotenv_keys() {
  { grep -hoE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null || true; } |
    sed -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/' |
    sort -u
}

# ${VAR} and ${VAR:-default} in compose files. Comment lines are stripped first:
# compose.yml documents the `${VAR:-default}` convention in its own header and
# that example is not a real variable.
compose_keys() {
  # shellcheck disable=SC2016 # the ${} here is compose syntax, not shell
  for file in "${COMPOSE_FILES[@]}"; do
    [ -f "$file" ] || continue
    sed -E 's/(^|[[:space:]])#.*$//' "$file" |
      { grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*' || true; } |
      sed -E 's/^\$\{//'
  done | sort -u
}

# process.env.X across application source. Dockerfiles are included on purpose:
# the web HEALTHCHECK reads process.env.PORT and that is a real read.
source_keys() {
  { grep -rhoE 'process\.env\.[A-Za-z_][A-Za-z0-9_]*' apps packages e2e \
    --exclude-dir=node_modules \
    --exclude-dir=.next \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=coverage \
    --exclude-dir=generated \
    --exclude-dir=.turbo \
    2>/dev/null || true; } |
    sed -E 's/^process\.env\.//' |
    sort -u
}

printf 'Checking .env hygiene\n\n'

if [ ! -f "$EXAMPLE_FILE" ]; then
  printf 'FAIL  %s is missing. It is the source of truth for variable names.\n' "$EXAMPLE_FILE" >&2
  exit 1
fi

# --- 1. .env must never reach git --------------------------------------------
if git rev-parse --git-dir >/dev/null 2>&1; then
  before=$failures

  if git ls-files --error-unmatch "$ENV_FILE" >/dev/null 2>&1; then
    fail "$ENV_FILE is tracked by git. Run: git rm --cached $ENV_FILE"
  fi

  staged="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    case "$path" in
      "$EXAMPLE_FILE") ;;
      .env | .env.* | */.env | */.env.*)
        fail "$path is staged. Secrets belong in an untracked $ENV_FILE."
        ;;
    esac
  done <<<"$staged"

  [ "$failures" -eq "$before" ] && pass "no dotenv file is tracked or staged"
else
  printf 'skip  not a git repository, staging check skipped\n'
fi

example_keys="$(dotenv_keys "$EXAMPLE_FILE")"
if [ -z "$example_keys" ]; then
  fail "$EXAMPLE_FILE declares no variables"
fi

# --- 2. .env against .env.example --------------------------------------------
if [ -f "$ENV_FILE" ]; then
  before=$failures
  local_keys="$(dotenv_keys "$ENV_FILE")"

  missing="$(comm -23 <(print_set "$example_keys") <(print_set "$local_keys"))"
  extra="$(comm -13 <(print_set "$example_keys") <(print_set "$local_keys"))"

  while IFS= read -r key; do
    [ -n "$key" ] || continue
    fail "$ENV_FILE is missing $key, which $EXAMPLE_FILE declares"
  done <<<"$missing"

  while IFS= read -r key; do
    [ -n "$key" ] || continue
    fail "$ENV_FILE declares $key, which $EXAMPLE_FILE does not. Document it."
  done <<<"$extra"

  [ "$failures" -eq "$before" ] && pass "$ENV_FILE and $EXAMPLE_FILE declare the same keys"
else
  printf 'skip  no %s on this machine, key comparison skipped\n' "$ENV_FILE"
fi

# --- 3. .env.example against the compose files -------------------------------
before=$failures
interpolated="$(compose_keys)"

undocumented="$(comm -23 <(print_set "$interpolated") <(print_set "$example_keys"))"
unused="$(comm -13 <(print_set "$interpolated") <(print_set "$example_keys"))"

while IFS= read -r key; do
  [ -n "$key" ] || continue
  fail "compose interpolates \${$key} but $EXAMPLE_FILE does not document it"
done <<<"$undocumented"

while IFS= read -r key; do
  [ -n "$key" ] || continue
  fail "$EXAMPLE_FILE documents $key but no compose file reads it"
done <<<"$unused"

[ "$failures" -eq "$before" ] && pass "compose interpolations and $EXAMPLE_FILE agree"

# --- 4. source reads against what is configurable ----------------------------
before=$failures
known="$(
  print_set "$example_keys"
  print_set "$interpolated"
  printf '%s\n' "${RUNTIME_INJECTED[@]}"
)"
known="$(print_set "$known" | sort -u)"
undeclared="$(comm -23 <(source_keys) <(print_set "$known"))"

while IFS= read -r key; do
  [ -n "$key" ] || continue
  fail "source reads process.env.$key, which is neither in $EXAMPLE_FILE nor injected by compose"
done <<<"$undeclared"

[ "$failures" -eq "$before" ] && pass "every process.env read is accounted for"

printf '\n'
if [ "$failures" -ne 0 ]; then
  cat >&2 <<EOF
${failures} check(s) failed.

.env.example is the source of truth for variable NAMES. A new variable has to be
added there, passed to a service in compose.yml, and mirrored in every local
.env. Never commit .env itself.
EOF
  exit 1
fi

printf '.env hygiene is clean.\n'
