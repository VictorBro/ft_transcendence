#!/bin/sh
# Host-side preflight for the devcontainer: devcontainer.json runs it as
# initializeCommand, on the HOST, before compose is read, on every open.
#
# It makes the compose variables in .env fit the machine the editor runs on, so
# the same checkout opens on a laptop with a rootful daemon and on a 42 cluster
# machine, where Docker is rootless and nobody has sudo:
#
#   WORKSPACE_USER   root on a rootless daemon. There container uid 0 IS your
#                    host user, and `node` (uid 1000) is a subuid that cannot
#                    write the bind-mounted repo.
#   DOCKER_SOCKET    the per-user socket of a rootless daemon. /var/run/docker.sock
#                    exists there too, but belongs to a daemon you cannot reach.
#   HTTP_PORT, HTTPS_PORT
#                    moved above the privileged range when the daemon cannot
#                    publish below it.
#   *_PORT           any published port another program already listens on (the
#                    clusters run a system redis on 6379).
#
# On a host where the current values already work this changes nothing, which
# is every rootful machine with free ports. It only ever replaces a value that
# cannot work here; a port you picked yourself and that is free stays.
#
# Not opening the devcontainer from VS Code? Run it yourself, from a HOST shell:
#   sh .devcontainer/initialize.sh
#
# POSIX sh on purpose: /bin/sh is dash on Ubuntu and bash 3 on macOS. It never
# exits non-zero, because a failing initializeCommand stops the container from
# opening at all, and on a host this script does not understand the defaults
# are the right answer.

# CDPATH would let a relative cd land in some other directory, and edit the
# .env it finds there.
CDPATH='' cd -- "$(dirname -- "$0")/.." 2>/dev/null || exit 0

ENV_FILE=.env
EXAMPLE_FILE=.env.example
TMP_FILE="$ENV_FILE.tmp.$$"

say() { printf '[devcontainer] %s\n' "$*"; }

# The temp file is a copy of .env, secrets included: it must not outlive a
# cancelled open.
trap 'rm -f "$TMP_FILE"' EXIT
trap 'rm -f "$TMP_FILE"; exit 0' HUP INT TERM

# From inside the container every answer below would be about the container:
# its own socket path, its own network namespace.
if [ -f /.dockerenv ]; then
  say 'this runs on the host, not in the container: Dev Containers: Reload Window re-runs it'
  exit 0
fi

command -v docker >/dev/null 2>&1 || exit 0
# A JSON array, or no answer. The exit status alone is not enough: older docker
# CLIs print `null` and exit 0 when the daemon is unreachable, and reading that
# as "not rootless" would undo the settings of a rootless machine.
security="$(docker info --format '{{json .SecurityOptions}}' 2>/dev/null)"
case "$security" in
  '['*) ;;
  *)
    say 'the Docker daemon does not answer, nothing checked'
    exit 0
    ;;
esac

case "$security" in
  *name=rootless*) rootless=1 ;;
  *) rootless=0 ;;
esac

# --- .env access ---------------------------------------------------------------

# How compose reads the file: an optional `export`, the last occurrence wins, a
# ` #` starts a comment, and quotes are not part of the value.
KEY_PREFIX='^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}'

env_get() {
  [ -f "$ENV_FILE" ] || return 0
  # The characters are spelled out: not every tr knows [:space:].
  sed -n "s/$KEY_PREFIX$1=//p" "$ENV_FILE" | tail -n 1 |
    sed 's/[[:space:]]#.*$//' | tr -d "\"' \\t\\r"
}

# The whole template, not just the keys written here: `make dev`, `make migrate`
# and the .env hygiene check all read a complete file.
ensure_env_file() {
  [ -f "$ENV_FILE" ] && return 0
  [ -f "$EXAMPLE_FILE" ] || return 1
  cp "$EXAMPLE_FILE" "$ENV_FILE" || return 1
  say "created $ENV_FILE from $EXAMPLE_FILE"
}

# Replaces the line in place, or appends when the key is missing. Never a
# second line for the same key: readers disagree on which one wins. Returns
# non-zero when nothing was written, so no caller reports a change that did not
# happen.
env_set() {
  ensure_env_file || {
    say "cannot create $ENV_FILE, $1 not set"
    return 1
  }
  [ -w "$ENV_FILE" ] || {
    say "$ENV_FILE is not writable, $1 not set"
    return 1
  }
  if grep -q "$KEY_PREFIX$1=" "$ENV_FILE"; then
    # cp -p first, so the copy has .env's mode before a secret lands in it.
    # The values travel through the environment: awk -v would rewrite a
    # backslash.
    cp -p "$ENV_FILE" "$TMP_FILE" 2>/dev/null &&
      key="$1" value="$2" awk '
        { line = $0; sub(/^[ \t]*(export[ \t]+)?/, "", line) }
        index(line, ENVIRON["key"] "=") == 1 { print ENVIRON["key"] "=" ENVIRON["value"]; next }
        { print }
      ' "$ENV_FILE" >"$TMP_FILE" || {
      rm -f "$TMP_FILE"
      say "could not rewrite $ENV_FILE, $1 not set"
      return 1
    }
    # Renamed into place, so a second window opening at the same moment never
    # reads half a file. A symlinked .env is written through instead, to stay
    # the link it was.
    if [ -L "$ENV_FILE" ]; then
      cat "$TMP_FILE" >"$ENV_FILE"
      rm -f "$TMP_FILE"
    else
      mv -f "$TMP_FILE" "$ENV_FILE"
    fi
  else
    # A last line with no newline would swallow the appended key.
    [ -z "$(tail -c 1 "$ENV_FILE")" ] || echo >>"$ENV_FILE"
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}

# --- who the workspace container runs as, and which socket it is handed --------

workspace_user="$(env_get WORKSPACE_USER)"
docker_socket="$(env_get DOCKER_SOCKET)"

if [ "$rootless" -eq 1 ]; then
  if [ "$workspace_user" != root ]; then
    env_set WORKSPACE_USER root &&
      say 'rootless Docker: WORKSPACE_USER=root (root in the container is you on the host)'
  fi

  # The endpoint the docker CLI itself uses. Not $DOCKER_HOST alone: an editor
  # started from the desktop may not have it, while the context always answers.
  endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null)"
  case "$endpoint" in
    unix://*) socket="${endpoint#unix://}" ;;
    *) socket="${DOCKER_HOST:-}" && socket="${socket#unix://}" ;;
  esac
  [ -S "$socket" ] || socket="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/docker.sock"
  if [ ! -S "$socket" ]; then
    say "rootless Docker, but no socket at $socket: docker will not work inside the container"
  elif [ "$docker_socket" != "$socket" ]; then
    env_set DOCKER_SOCKET "$socket" &&
      say "rootless Docker: DOCKER_SOCKET=$socket"
  fi
else
  # Values a .env brought along from a rootless machine. As root on a rootful
  # daemon every file the session writes is owned by host root, and a socket
  # path that does not exist stops the container from being created.
  if [ "$workspace_user" = root ]; then
    env_set WORKSPACE_USER '' &&
      say 'rootful Docker: WORKSPACE_USER cleared, the session runs as node again'
  fi
  if [ -n "$docker_socket" ] && [ ! -S "$docker_socket" ]; then
    env_set DOCKER_SOCKET '' &&
      say "DOCKER_SOCKET cleared: $docker_socket is not a socket on this machine"
  fi
fi

# --- published ports -----------------------------------------------------------

# Lowest port an unprivileged process may bind. Only a rootless daemon is held
# to it: a rootful one binds as root.
unprivileged_from=0
if [ "$rootless" -eq 1 ] && [ -r /proc/sys/net/ipv4/ip_unprivileged_port_start ]; then
  unprivileged_from="$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start)"
fi

# The project name labels every container of this stack. Resolved the way
# compose and the Dev Containers CLI do: the environment, then .env, then
# `name:` in compose.yml.
project="${COMPOSE_PROJECT_NAME:-$(env_get COMPOSE_PROJECT_NAME)}"
[ -n "$project" ] ||
  project="$(sed -n 's/^name:[[:space:]]*//p' compose.yml 2>/dev/null | head -n 1)"
# Ports this stack already publishes. Without this a running stack makes its own
# ports look taken, and every open would move them.
published="$(docker ps --filter "label=com.docker.compose.project=${project:-ft_transcendence}" \
  --format '{{.Ports}}' 2>/dev/null)"

is_ours() {
  case "$published" in
    *":$1->"*) return 0 ;;
    *) return 1 ;;
  esac
}

# is_listening PORT SCOPE: would a listener stop compose from publishing PORT?
# `loopback` is db and redis, published on 127.0.0.1 only, so a program bound
# to some other address is not in the way. `any` is caddy, which takes the port
# on every address.
is_listening() {
  if command -v ss >/dev/null 2>&1; then
    if [ "$2" = loopback ]; then
      ss -Hltn 2>/dev/null | awk '{ print $4 }' |
        grep -qE "^(127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\*|\\[::\\]):$1\$"
    else
      ss -Hltn 2>/dev/null | awk '{ print $4 }' | grep -q ":$1\$"
    fi
  elif command -v nc >/dev/null 2>&1; then
    # Before lsof: without root, lsof only lists your own processes, and the
    # listener in the way usually belongs to someone else.
    nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

claimed=' '

# Two keys on one port is a clash too, whatever listens there.
is_claimed() {
  case "$claimed" in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# usable PORT SCOPE
usable() {
  [ "$1" -ge "$unprivileged_from" ] || return 1
  is_claimed "$1" && return 1
  is_ours "$1" && return 0
  ! is_listening "$1" "$2"
}

# check_port KEY DEFAULT FIRST_ALTERNATIVE SCOPE
check_port() {
  current="$(env_get "$1")"
  case "$current" in
    '') current="$2" ;;
    *[!0-9]*)
      say "$1=$current is not a port number, left alone"
      return 0
      ;;
  esac
  if usable "$current" "$4"; then
    claimed="$claimed$current "
    return 0
  fi

  candidate="$3"
  tries=0
  while [ "$tries" -lt 50 ]; do
    usable "$candidate" "$4" && break
    candidate=$((candidate + 1))
    tries=$((tries + 1))
  done
  if [ "$tries" -ge 50 ]; then
    say "$1=$current cannot be published here and no free port was found from $3 up"
    return 0
  fi

  if [ "$current" -lt "$unprivileged_from" ]; then
    reason="a rootless daemon cannot publish below $unprivileged_from"
  elif is_claimed "$current"; then
    reason='another key above already uses it'
  else
    reason='another program already listens there'
  fi
  env_set "$1" "$candidate" || return 0
  claimed="$claimed$candidate "
  say "$1: $current -> $candidate ($reason)"
}

check_port HTTP_PORT 80 8080 any
check_port HTTPS_PORT 443 8443 any
check_port POSTGRES_HOST_PORT 5432 5433 loopback
check_port REDIS_HOST_PORT 6379 6380 loopback

exit 0
