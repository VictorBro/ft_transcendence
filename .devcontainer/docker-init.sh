#!/bin/sh
# Entrypoint wrapper for the workspace service (docker-outside-of-docker).
#
# The host Docker socket arrives at /var/run/docker-host.sock (see
# compose.override.yml), and the docker CLI looks for /var/run/docker.sock.
# How the two are joined depends on who this container runs as:
#
#   node  A rootful daemon. The host socket is owned by root and a host-side
#         group whose gid does not exist in this image, so `node` cannot talk
#         to it directly. Rather than mutating the host socket's ownership,
#         bridge it: socat listens on a container-local /var/run/docker.sock
#         owned by `node` and relays to the host socket as root. This is the
#         same mechanism the official devcontainers docker-outside-of-docker
#         feature installs as docker-init.sh. sudo is passwordless in this
#         image (see Dockerfile).
#
#   root  A rootless daemon (.devcontainer/initialize.sh sets WORKSPACE_USER).
#         Container root is the host user, who owns the per-user socket, so a
#         symlink is all it takes.
#
# This is the container's command: a failure here means no container, so
# nothing below is allowed to stop it.
set -u

SOURCE_SOCKET=/var/run/docker-host.sock
TARGET_SOCKET=/var/run/docker.sock

# Everything that persists lives under /home/node (the named volumes, the rc
# files), and HOME points there for every user (compose.override.yml). Two
# programs do not take $HOME's word for it:
#   ssh      resolves ~/.ssh through the passwd entry, so root would read
#            /root/.ssh and never see the ssh-config volume.
#   Firefox  refuses to start as root while $HOME belongs to someone else,
#            which is what `make playwright-all` would run into.
root_home() {
  if [ "$(awk -F: '$1 == "root" { print $6 }' /etc/passwd)" != /home/node ]; then
    # Not usermod: it refuses to touch a user that has running processes, and
    # this one runs the container.
    awk -F: -v OFS=: '$1 == "root" { $6 = "/home/node"; $7 = "/bin/zsh" } { print }' \
      /etc/passwd >/etc/passwd.new && cat /etc/passwd.new >/etc/passwd ||
      echo "docker-init: could not point root's home at /home/node, ssh will look in /root/.ssh" >&2
    rm -f /etc/passwd.new
  fi
  # Top level only: that is all Firefox looks at, and root reads the rest as is.
  chown root:root /home/node ||
    echo "docker-init: could not hand /home/node to root, Firefox will refuse to start" >&2
}

if [ "$(id -u)" -eq 0 ]; then
  root_home
fi

if [ ! -S "$SOURCE_SOCKET" ]; then
  echo "docker-init: ${SOURCE_SOCKET} is not a socket, the docker CLI will not work." >&2
  echo "docker-init: check DOCKER_SOCKET in .env, then rebuild the container." >&2
elif [ "$(id -u)" -eq 0 ]; then
  ln -sf "$SOURCE_SOCKET" "$TARGET_SOCKET"
else
  sudo rm -f "$TARGET_SOCKET"
  sudo /usr/bin/socat \
    "UNIX-LISTEN:${TARGET_SOCKET},fork,mode=660,user=node,backlog=128" \
    "UNIX-CONNECT:${SOURCE_SOCKET}" \
    >/tmp/docker-init.log 2>&1 &
fi

# compose always passes `sleep infinity`; a bare `docker run` of this script
# should keep the container up too, not exit at once.
[ "$#" -gt 0 ] || set -- sleep infinity

exec "$@"
