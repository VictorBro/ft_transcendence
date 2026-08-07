#!/usr/bin/env bash
#
# Onboarding smoke test: everything a fresh clone needs before `make all` can
# work, with the fixing command printed next to every failure.
#
#   make doctor
#
# Deliberately not `set -e`: every probe below is expected to fail on somebody's
# machine, and the point is to report all of them in one run rather than stop at
# the first.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; Z=$'\033[0m'
else
  G=''; Y=''; R=''; B=''; Z=''
fi

failures=0
warnings=0

section() { printf '\n%s%s%s\n' "$B" "$1" "$Z"; }
ok()      { printf '  %sok%s    %s\n' "$G" "$Z" "$1"; }
warn()    { printf '  %swarn%s  %s\n' "$Y" "$Z" "$1"; warnings=$((warnings + 1)); }
fail()    { printf '  %sFAIL%s  %s\n' "$R" "$Z" "$1"; failures=$((failures + 1)); }
hint()    { printf '        %s\n' "$1"; }

printf '%sft_transcendence development environment%s\n' "$B" "$Z"

# --- environment -------------------------------------------------------------
section 'Environment'

if [ -f /.dockerenv ]; then
  ok 'inside the devcontainer'
  if [ -n "${LOCAL_WORKSPACE_FOLDER:-}" ]; then
    ok "LOCAL_WORKSPACE_FOLDER=$LOCAL_WORKSPACE_FOLDER"
  else
    fail 'LOCAL_WORKSPACE_FOLDER is unset'
    hint 'Compose resolves bind mounts against the HOST filesystem, so make dev'
    hint 'would mount the wrong paths. Rebuild the container: devcontainer.json'
    hint 'injects this through remoteEnv.'
  fi
else
  ok 'on the host'
fi

# --- toolchain ---------------------------------------------------------------
section 'Toolchain'

want_node="$(sed 's/^v//; s/[[:space:]]//g' .nvmrc 2>/dev/null)"
have_node="$(node -v 2>/dev/null | sed 's/^v//')"
if [ -z "$have_node" ]; then
  fail 'node is not installed'
elif [ "$have_node" = "$want_node" ]; then
  ok "node $have_node"
else
  fail "node $have_node, .nvmrc pins $want_node"
  hint 'Inside the devcontainer this means the image is stale: rebuild it.'
fi

want_pnpm="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)"
have_pnpm="$(pnpm --version 2>/dev/null)"
if [ -z "$have_pnpm" ]; then
  fail 'pnpm is not installed'
  hint 'corepack enable && corepack prepare pnpm@'"$want_pnpm"' --activate'
elif [ "$have_pnpm" = "$want_pnpm" ]; then
  ok "pnpm $have_pnpm"
else
  fail "pnpm $have_pnpm, package.json pins $want_pnpm"
  hint "corepack prepare pnpm@$want_pnpm --activate"
fi

if ! command -v docker >/dev/null 2>&1; then
  fail 'docker CLI not found'
elif docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  ok "docker daemon reachable ($(docker version --format '{{.Server.Version}}' 2>/dev/null))"
else
  fail 'docker CLI cannot reach the daemon'
  hint 'Inside the devcontainer the socket bridge failed: check /tmp/docker-init.log,'
  hint 'and that compose.override.yml still mounts /var/run/docker-host.sock.'
fi

if [ -d node_modules ] && [ -d e2e/node_modules ]; then
  ok 'dependencies installed'
else
  fail 'dependencies are missing or incomplete'
  hint 'pnpm install'
fi

# --- git identity ------------------------------------------------------------
# The subject grades commits from every team member, and an unset identity fails
# silently: the commit still lands, just attributed to nobody recognisable.
section 'Git identity'

git_name="$(git config user.name 2>/dev/null)"
git_email="$(git config user.email 2>/dev/null)"
if [ -n "$git_name" ] && [ -n "$git_email" ]; then
  ok "commits authored as $git_name <$git_email>"
  hint 'This address must be on your GitHub account, or commits are not linked'
  hint 'to you and the graded work distribution undercounts your work.'
else
  fail 'git user.name or user.email is unset'
  hint 'git config --global user.name "Your Name"'
  hint 'git config --global user.email "you@example.com"'
fi

# --- github access -----------------------------------------------------------
section 'GitHub access'

github_identity() {
  ssh -n -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
    "$@" -T git@github.com 2>&1 | sed -n 's/^Hi \([^!]*\)!.*/\1/p'
}

key_count=0
if [ -n "${SSH_AUTH_SOCK:-}" ] && ssh-add -l >/dev/null 2>&1; then
  key_count="$(ssh-add -l | wc -l | tr -d ' ')"
  ok "ssh agent available, $key_count key(s)"
else
  warn 'no ssh agent (VS Code forwards one; plain docker exec does not)'
fi

identity="$(github_identity)"
if [ -n "$identity" ]; then
  ok "github.com authenticates you as $identity"
else
  fail 'github.com does not accept any of your ssh keys'
  hint 'Add your public key at https://github.com/settings/keys'
fi

if git remote get-url origin >/dev/null 2>&1; then
  # --dry-run negotiates with the remote but sends no update, so this proves
  # write access without creating anything. The probe ref is never created.
  if git push --dry-run origin HEAD:refs/heads/__doctor_probe__ >/dev/null 2>&1; then
    ok 'push access to origin confirmed'
  else
    fail "no push access to origin as ${identity:-unknown}"
    if [ "$key_count" -gt 1 ]; then
      hint 'Your agent holds several keys and ssh offers the wrong one first.'
      hint 'Each key maps to this GitHub account:'
      tmp="$(mktemp -d)"
      i=0
      while IFS= read -r line; do
        i=$((i + 1))
        printf '%s\n' "$line" > "$tmp/k$i.pub"
        hint "  $(printf '%s' "$line" | awk '{print $3}')  ->  $(github_identity -o IdentitiesOnly=yes -o IdentityFile="$tmp/k$i.pub")"
      done < <(ssh-add -L)
      rm -rf "$tmp"
      hint 'Pin the one that owns the repo (public key only, no secret on disk):'
      hint '  ssh-add -L | grep <that key comment> > ~/.ssh/github.pub'
      hint '  printf "Host github.com\\n  IdentitiesOnly yes\\n  IdentityFile ~/.ssh/github.pub\\n" > ~/.ssh/config'
      hint '  chmod 600 ~/.ssh/config ~/.ssh/github.pub'
    else
      hint 'Ask the repository owner to add you as a collaborator with write access.'
    fi
  fi
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  ok "gh authenticated as $(gh api user --jq .login 2>/dev/null)"
else
  warn 'gh is not authenticated (needed for gh pr create)'
  hint 'gh auth login'
fi

# --- verdict -----------------------------------------------------------------
printf '\n'
if [ "$failures" -ne 0 ]; then
  printf '%s%s check(s) failed%s, %s warning(s). Fix the FAIL lines above, then rerun.\n' \
    "$R" "$failures" "$Z" "$warnings"
  exit 1
fi
printf '%sReady.%s %s warning(s). `make all` should pass.\n' "$G" "$Z" "$warnings"
