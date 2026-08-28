#!/bin/sh
# postStartCommand for the workspace service. uid 0 only: a `node` session,
# which is what every rootful-daemon machine gets, exits at the guard.
#
# On a rootless daemon the session runs as root (see remoteUser in
# devcontainer.json), and ssh ignores $HOME: it finds ~/.ssh through
# getpwuid(getuid()), so uid 0 reads /root/.ssh and never sees the ssh-config
# volume at /home/node/.ssh. Repointing root's passwd home fixes that.
#
# Not `ssh -F /home/node/.ssh/config`: -F changes which file is read without
# changing the tilde base, so `IdentityFile ~/.ssh/...` inside it still resolves
# against /root. With `IdentitiesOnly yes` that offers zero keys.
set -eu

[ "$(id -u)" -eq 0 ] || exit 0

sed -i 's|^root:x:0:0:root:/root:|root:x:0:0:root:/home/node:|' /etc/passwd

# At the default path OpenSSH enforces ownership, accepting the reader or root.
# root:root 0644 is the one seeding both a root and a later `node` session read.
if [ -f /home/node/.ssh/config ]; then
  chown 0:0 /home/node/.ssh/config
  chmod 0644 /home/node/.ssh/config
fi
