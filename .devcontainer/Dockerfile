# Devcontainer shell image. Built by the `workspace` service in
# compose.override.yml, which sets the build context to the REPO ROOT:
#
#   docker compose --profile devcontainer build workspace
#
# Nothing from the repo is baked in. The source arrives at runtime through the
# `.:/workspace` bind mount, so this image only has to carry the toolchain.
# BuildKit reads .devcontainer/Dockerfile.dockerignore in preference to a
# context-root .dockerignore, which is why that file sits next to this one.

FROM node:24.18-bookworm-slim

# ARG, not ENV: noninteractive is a build-time concern and must not leak into
# the shell the developer ends up in.
ARG DEBIAN_FRONTEND=noninteractive

ENV LANG=C.UTF-8 \
    SHELL=/bin/zsh \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Corepack defaults to $HOME/.cache/node/corepack. That path is a candidate for
# a named volume (see the /home/node/.cache note further down), and a volume
# mounted there would hide the pnpm tarball baked in below, sending the first
# command of every session back to the network. Park it outside $HOME.
ENV COREPACK_HOME=/usr/local/share/corepack

# Mirrors what the workspace service sets, so a bare `docker run` on this image
# behaves like `docker compose run`.
ENV HISTFILE=/commandhistory/.history \
    CLAUDE_CONFIG_DIR=/home/node/.claude

# openssl: node:*-bookworm-slim ships no libssl, and Prisma then misdetects the
#   version and fails to load its engine (docs/VERSIONS.md trap 1c).
# openssh-client: git pulls it only as a Recommends, and this image installs
#   with --no-install-recommends. Without it every ssh:// remote fails.
# procps / less / jq / make: ps for debugging, less for the git pager, jq for
#   poking at API responses, make for the repo Makefile.
# socat: bridges the host Docker socket to a node-owned one (docker-init.sh).
# zsh-autosuggestions / zsh-syntax-highlighting: sourced by .devcontainer/zshrc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        less \
        make \
        openssh-client \
        openssl \
        procps \
        socat \
        sudo \
        zsh \
        zsh-autosuggestions \
        zsh-syntax-highlighting \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI + plugins, and gh, from their vendor apt repos so they stay
# patchable with the rest of the image.
#
# docker-outside-of-docker: this is the CLIENT ONLY. No daemon, no dockerd
# package. It drives the HOST daemon over /var/run/docker.sock, which has to be
# bind-mounted onto the workspace service. See devcontainer.json.
#
# Keys are stored as apt reads them (docker publishes ASCII armor, gh publishes
# an already-dearmored keyring) and referenced with signed-by=, so gnupg is
# never needed.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod a+r /etc/apt/keyrings/docker.asc /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && ARCH="$(dpkg --print-architecture)" \
    && echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        docker-ce-cli \
        docker-buildx-plugin \
        docker-compose-plugin \
        gh \
    && rm -rf /var/lib/apt/lists/*

# Tab completion for the CLIs installed above. vendor-completions is on zsh's
# default fpath in Debian, so compinit picks these up with no zshrc changes.
RUN docker completion zsh > /usr/share/zsh/vendor-completions/_docker \
    && gh completion -s zsh > /usr/share/zsh/vendor-completions/_gh

# Shared-library dependencies of the three browsers the suite runs on
# (Chromium, Firefox, WebKit), so the e2e step of `make all` runs inside this
# container without `playwright install --with-deps` (which needs root and
# would put the package set outside this file). The list is Playwright's own
# for debian12, from playwright-core's nativeDeps: when the Playwright pin
# moves, compare it again. The browser BINARIES are not baked in: playwright
# downloads the exact builds its version pins into ~/.cache/ms-playwright,
# which compose.override.yml backs with a named volume, so they survive
# rebuilds and stay in the lockfile's control.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-liberation \
        gstreamer1.0-libav \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatomic1 \
        libatspi2.0-0 \
        libavcodec59 \
        libavif15 \
        libcairo-gobject2 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdbus-glib-1-2 \
        libdrm2 \
        libegl1 \
        libenchant-2-2 \
        libepoxy0 \
        libevdev2 \
        libevent-2.1-7 \
        libfontconfig1 \
        libfreetype6 \
        libgbm1 \
        libgdk-pixbuf-2.0-0 \
        libgles2 \
        libglib2.0-0 \
        libglx0 \
        libgstreamer-gl1.0-0 \
        libgstreamer-plugins-base1.0-0 \
        libgstreamer1.0-0 \
        libgtk-3-0 \
        libgtk-4-1 \
        libgudev-1.0-0 \
        libharfbuzz-icu0 \
        libharfbuzz0b \
        libhyphen0 \
        libicu72 \
        libjpeg62-turbo \
        liblcms2-2 \
        libmanette-0.2-0 \
        libnotify4 \
        libnspr4 \
        libnss3 \
        libopengl0 \
        libopenjp2-7 \
        libopus0 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libpng16-16 \
        libproxy1v5 \
        libsecret-1-0 \
        libsoup-3.0-0 \
        libwayland-client0 \
        libwayland-egl1 \
        libwayland-server0 \
        libwebp7 \
        libwebpdemux2 \
        libwoff1 \
        libx11-6 \
        libx11-xcb1 \
        libxcb-shm0 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxkbcommon0 \
        libxml2 \
        libxrandr2 \
        libxrender1 \
        libxslt1.1 \
        libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Socket bridge for docker-outside-of-docker, run as the workspace service's
# command (compose.override.yml). See the script header for the why.
COPY --chmod=0755 .devcontainer/docker-init.sh /usr/local/share/docker-init.sh

# Corepack ships with Node 24 and is gone in 25+ (docs/VERSIONS.md trap 3).
# The version must match `packageManager` in the root package.json or pnpm
# refuses to run. COREPACK_HOME is handed to node: corepack rewrites its
# lastKnownGood file on activation, and root will not be the one running it.
RUN corepack enable \
    && corepack prepare pnpm@11.18.0 --activate \
    && chown -R node:node "$COREPACK_HOME" \
    && chmod -R a+rX "$COREPACK_HOME"

# The image already has a `node` user at uid/gid 1000, the usual first-user uid
# on Linux, so bind-mounted files stay writable with no uid remapping.
#
# safe.directory covers the hosts where that is not true: Docker Desktop on
# macOS and Windows reports a different owner for the bind mount and git then
# refuses to touch the repo with "detected dubious ownership".
RUN echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node \
    && usermod --shell /bin/zsh node \
    && git config --system --add safe.directory /workspace

# REQUIRED. Docker creates a missing mount target as root:root, and a named
# volume seeds itself from whatever sits at that path in the image. If these
# directories do not already exist owned by node, the volumes (claude-state,
# shell-history, vscode-extensions, gh-config, ssh-config, node-cache) come up
# root-owned and every write fails with EACCES.
RUN mkdir -p \
        /home/node/.claude \
        /home/node/.gemini \
        /home/node/.cache/pnpm/store \
        /home/node/.config/gh \
        /home/node/.ssh \
        /home/node/.vscode-server/extensions \
        /commandhistory \
        /pnpm \
        /workspace \
    && touch /commandhistory/.history \
    && printf 'store-dir=/home/node/.cache/pnpm/store\n' > /home/node/.npmrc \
    && chown -R node:node /home/node /commandhistory /pnpm /workspace \
    # ssh ignores its config and refuses agent identities if this is group or
    # world readable. The volume inherits the mode from this directory.
    && chmod 700 /home/node/.ssh

# History for both shells, appended after every command rather than at exit: a
# container that is torn down instead of logged out never gets to flush.
COPY --chown=node:node .devcontainer/zshrc /home/node/.zshrc
COPY --chown=node:node .devcontainer/bash-history.sh /home/node/.bash-history.sh
RUN printf '\n. "$HOME/.bash-history.sh"\n' >> /home/node/.bashrc \
    && chown node:node /home/node/.bashrc

# Everything from here runs unprivileged; sudo covers the rest.
USER node
WORKDIR /workspace

# No CMD on purpose: compose.override.yml supplies `sleep infinity` with
# init: true, so the container gets a PID 1 that reaps children and forwards
# signals instead of ignoring them.
