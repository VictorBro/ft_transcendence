#!/usr/bin/env bash
# Keeps the pull request title a valid Conventional Commit.
#
# GitHub uses the title as the squash subject for any pull request carrying more
# than one commit, so an unconventional one lands on main and fails the
# commitlint job there, where the only remedy left is rewriting a protected
# branch.
#
# A title GitHub generated itself, "Update eval doc" from the branch
# update_eval_doc, can never pass. Rather than leave the author with a red check
# they have to clear by hand, derive a title and rename the pull request:
#
#   1. the subject of the only commit, when the pull request has exactly one.
#      The commitlint job gates every commit, so that subject is already valid,
#      and a one-commit squash would have used it anyway.
#   2. the branch name, when it follows the type/slug convention CONTRIBUTING.md
#      documents. ci/lint-pr-title becomes "ci: lint pr title".
#
# Nothing derivable, or nothing that lints: fail and say what to write.
#
# Reads PR_TITLE, PR_NUMBER, BRANCH, GITHUB_REPOSITORY and GH_TOKEN.
set -euo pipefail

lint() {
  # --package, not `pnpm dlx @commitlint/cli`: dlx derives the command name from
  # the last path segment, which would be `cli`.
  pnpm dlx --package "@commitlint/cli@21.2.1" commitlint \
    --config .github/commitlint.config.mjs "$@"
}

# Read the accepted types out of the config rather than repeating them, so the
# two cannot drift apart.
types="$(node -e "import('./.github/commitlint.config.mjs').then((m) =>
  console.log(m.default.rules['type-enum'][2].join('|')))")"

if printf '%s\n' "$PR_TITLE" | lint --verbose; then
  exit 0
fi

printf '\nThat title would land on main as an ungradeable commit. Deriving one.\n\n'

derived=''
subjects="$(gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" \
  --json commits --jq '.commits[].messageHeadline' || true)"

if [ "$(printf '%s' "$subjects" | grep -c . || true)" = '1' ]; then
  derived="$subjects"
elif [[ "$BRANCH" =~ ^(${types})/(.+)$ ]]; then
  derived="${BASH_REMATCH[1]}: ${BASH_REMATCH[2]//[-_]/ }"
fi

if [ -z "$derived" ] || ! printf '%s\n' "$derived" | lint >/dev/null 2>&1; then
  printf 'Nothing valid to derive from, so rename the pull request yourself.\n'
  printf 'Write "type: subject", for example "fix: stop the locale switcher losing the route".\n'
  printf 'Types: %s\n' "${types//|/, }"
  exit 1
fi

if ! gh pr edit "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --title "$derived"; then
  printf 'Could not rename it: a pull request opened from a fork gets a read-only token.\n'
  printf 'Rename it by hand to: %s\n' "$derived"
  exit 1
fi

printf 'Renamed to: %s\n' "$derived"
