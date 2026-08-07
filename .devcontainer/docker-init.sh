#!/bin/sh
# Entrypoint wrapper for the workspace service (docker-outside-of-docker).
#
# The host Docker socket arrives at /var/run/docker-host.sock (see
# compose.override.yml). It is owned by root and a host-side group whose gid
# does not exist in this image, so the `node` user cannot talk to it directly.
# Rather than mutating the host socket's ownership, bridge it: socat listens on
# a container-local /var/run/docker.sock owned by `node` and relays to the host
# socket as root. This is the same mechanism the official devcontainers
# docker-outside-of-docker feature installs as docker-init.sh.
#
# Runs as `node`; sudo is passwordless in this image (see Dockerfile).
set -eu

SOURCE_SOCKET=/var/run/docker-host.sock
TARGET_SOCKET=/var/run/docker.sock

if [ -S "$SOURCE_SOCKET" ]; then
  sudo rm -f "$TARGET_SOCKET"
  sudo /usr/bin/socat \
    "UNIX-LISTEN:${TARGET_SOCKET},fork,mode=660,user=node,backlog=128" \
    "UNIX-CONNECT:${SOURCE_SOCKET}" \
    >/tmp/docker-init.log 2>&1 &
else
  echo "docker-init: ${SOURCE_SOCKET} is not mounted, the docker CLI will not work" >&2
fi

exec "$@"
