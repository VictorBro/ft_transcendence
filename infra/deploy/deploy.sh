#!/usr/bin/env bash
# Redeploy when a released image moves. Driven by ft-deploy.timer.
#
# Pull-based on purpose: the server reaches out to a public registry, so there is
# no deploy key in GitHub and nothing inbound to expose.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE=compose.deploy.yml
# What was last deployed *successfully*. Comparing against the pre-pull state
# instead would mark a failed deploy as done and never retry it.
STATE=.deployed
OURS='ghcr.io/victorbro/ft_transcendence/'

dc() { docker compose -f "$COMPOSE" --profile migrate "$@"; }

# Local id of every image the stack references, profiled ones included.
resolve() {
  dc config --images | sort -u | while read -r ref; do
    # inspect prints a blank line before failing, so the id is taken separately.
    # `|| true` matters: pipefail plus set -e would abort on the first image
    # this host has not pulled yet, which is every image on a fresh box.
    id=$(docker image inspect -f '{{.Id}}' "$ref" 2>/dev/null | head -1) || true
    printf '%s %s\n' "$ref" "${id:-absent}"
  done
}

revision() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null || true
}

dc pull --quiet

# images.yml merges one manifest per image in parallel, so a pull can land
# between them and mix a new api with an old tooling. Each carries its commit as
# a label, so disagreement means the release is still going out.
revisions=$(dc config --images | grep "^$OURS" | while read -r ref; do revision "$ref"; done | sort -u)
if [ -z "$revisions" ] || [ "$(echo "$revisions" | wc -l)" -ne 1 ]; then
  echo "release still publishing, waiting: $(echo "$revisions" | tr '\n' ' ')"
  exit 0
fi

current=$(resolve)
if [ -f "$STATE" ] && [ "$current" = "$(cat "$STATE")" ]; then
  echo "no change"
  exit 0
fi

echo "deploying $revisions"

# Schema first: a container booting against a schema it predates fails in ways
# that are harder to read than a failed migration. set -e stops here on failure,
# so the running stack is left alone and the next tick retries.
dc run --rm migrate

# No --profile here, or compose would start the one-shot migrate as a service.
docker compose -f "$COMPOSE" up -d

# Only now is this state known good.
echo "$current" >"$STATE"

# The images just replaced are now dangling, and the boot volume is 46 GB.
docker image prune -f
