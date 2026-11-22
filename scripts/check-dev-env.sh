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
# Asked outside the repo: inside it, pnpm 11 switches to the packageManager
# version before it answers, so the two would always match.
have_pnpm="$(cd / && pnpm --version 2>/dev/null)"
if [ -z "$have_pnpm" ]; then
  fail 'pnpm is not installed'
  hint "npm install -g pnpm@$want_pnpm (sudo if npm needs it; in the devcontainer, rebuild it)"
elif [ "$have_pnpm" = "$want_pnpm" ]; then
  ok "pnpm $have_pnpm"
else
  fail "pnpm $have_pnpm, package.json pins $want_pnpm"
  hint "npm install -g pnpm@$want_pnpm (sudo if npm needs it; in the devcontainer, rebuild it)"
fi

if ! command -v docker >/dev/null 2>&1; then
  fail 'docker CLI not found'
elif docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  ok "docker daemon reachable ($(docker version --format '{{.Server.Version}}' 2>/dev/null))"
else
  fail 'docker CLI cannot reach the daemon'
  hint 'Inside the devcontainer the socket bridge failed: check /tmp/docker-init.log,'
  hint 'and that compose.override.yml still mounts /var/run/docker-host.sock.'
  hint 'On a rootless daemon DOCKER_SOCKET in .env must be its per-user socket:'
  hint '.devcontainer/initialize.sh sets it when the container is (re)built.'
fi

# On a rootless daemon container uid 0 is the host user and every other uid is
# a subuid that cannot write the bind-mounted repo, so the session has to be
# root there, and must not be root anywhere else. .devcontainer/initialize.sh
# decides this on the host before the container is created; a container that
# predates it, or a .env replaced while the container was open, is how the two
# come apart.
#
# Read from the user namespace, not asked of the daemon: in exactly that
# mismatch the daemon does not answer either. A rootless daemon maps container
# uid 0 to one unprivileged host uid ("0 102469 1"), a rootful one maps
# everything to itself ("0 0 4294967295").
if [ -f /.dockerenv ] && [ -r /proc/self/uid_map ]; then
  refit='Command Palette, "Dev Containers: Rebuild Container": it runs .devcontainer/initialize.sh on the host first.'
  # Read the way initialize.sh reads it, which is the way compose does: an
  # optional `export`, the last occurrence wins, a ` #` starts a comment.
  env_value() {
    sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}$1=//p" .env 2>/dev/null |
      tail -n 1 | sed 's/[[:space:]]#.*$//' | tr -d "\"' \t\r"
  }
  if [ -n "$(awk 'NR == 1 && $1 == 0 && $2 != 0 && $3 == 1' /proc/self/uid_map)" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      ok 'rootless daemon, session is root (your own user on the host)'
    else
      fail "rootless daemon, but the session is $(id -un): it cannot write the repo"
      hint "$refit"
    fi
    # What initialize.sh would have written. A .env copied in from a laptop, or
    # recreated by make while the container was open, has none of it, and the
    # next `make` then stops on a port the daemon cannot publish.
    unfit=''
    [ "$(env_value WORKSPACE_USER)" = root ] || unfit="$unfit WORKSPACE_USER"
    [ -n "$(env_value DOCKER_SOCKET)" ] || unfit="$unfit DOCKER_SOCKET"
    # The two ports cannot be judged the same way. initialize.sh moves one only
    # when it is below the HOST's net.ipv4.ip_unprivileged_port_start: 1024,
    # unless the host lowered it so that a rootless daemon can publish 80 and
    # 443. That number cannot be read from in here, /proc/sys in a container
    # describes the container's own network namespace. So a port below 1024 is
    # settled only by caddy publishing it right now, and is a warning
    # otherwise: a FAIL would never clear on a host that allows the port, where
    # a rebuild writes the same value again.
    low=''
    for pair in HTTP_PORT:80 HTTPS_PORT:443; do
      key="${pair%:*}"
      value="$(env_value "$key")"
      # Unset is the compose default, the standard port.
      value="${value:-${pair#*:}}"
      case "$value" in
        *[!0-9]*) unfit="$unfit $key" ;;
        *)
          if [ "$value" -lt 1024 ] &&
            [ "$(docker compose port caddy "${pair#*:}" 2>/dev/null | sed 's/.*://')" != "$value" ]; then
            low="$low $key=$value"
          fi
          ;;
      esac
    done
    if [ -n "$unfit" ]; then
      fail ".env is not fitted to a rootless daemon:$unfit"
      hint "$refit"
    elif [ -z "$low" ]; then
      ok '.env is fitted to a rootless daemon'
    fi
    if [ -n "$low" ]; then
      warn "below 1024, which a rootless daemon publishes only where the host allows it:$low"
      hint 'Nothing publishes them now, and the host setting that decides,'
      hint 'net.ipv4.ip_unprivileged_port_start, cannot be read from inside a container.'
      hint 'If make stops on a privileged port, initialize.sh moves them:'
      hint "$refit"
    fi
  elif [ "$(id -u)" -eq 0 ]; then
    fail 'rootful daemon, but the session is root: files it writes are root-owned on the host'
    hint "$refit"
  fi
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
  hint 'Run them on the HOST: VS Code copies ~/.gitconfig into every new container,'
  hint 'while a value set in here is gone at the next rebuild.'
fi

# --- github access -----------------------------------------------------------
section 'GitHub access'

github_identity() {
  ssh -n -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
    "$@" -T git@github.com 2>&1 | sed -n 's/^Hi \([^!]*\)!.*/\1/p'
}

key_count=0
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
  warn 'no ssh agent (VS Code forwards one; plain docker exec does not)'
else
  # ssh-add -l exits 0 holding keys, 1 when the agent answers but is empty, and
  # 2 when it cannot be reached at all. Reporting 1 as "no ssh agent" sends you
  # to look at the forwarding, which is the one part that is working: on a
  # fresh machine the usual cause is that nobody has run ssh-add on the HOST.
  ssh-add -l >/dev/null 2>&1
  case $? in
    0)
      key_count="$(ssh-add -l | wc -l | tr -d ' ')"
      ok "ssh agent available, $key_count key(s)"
      ;;
    1)
      warn 'ssh agent reachable but holding no keys'
      hint 'On the HOST, not in this container: ssh-add <your private key>,'
      hint 'e.g. ssh-add ~/.ssh/id_ed25519. The container sees it at once.'
      ;;
    *)
      warn 'SSH_AUTH_SOCK is set but no agent answers on it'
      ;;
  esac
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
