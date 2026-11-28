#!/usr/bin/env bash
# Redeploy when a released image moves. Driven by ft-deploy.timer.
#
# Pull-based on purpose: the server reaches out to a public registry, so there is
# no deploy key in GitHub and nothing inbound to expose.
set -euo pipefail

cd "$(dirname "$0")"

# compose's `:?` stops an empty secret, not a published one: a dev .env, or the
# template filled in with the repo's local defaults, passes it. So refuse the
# values this repo publishes (compose.yml, the Makefile, ci.yml, e2e.yml), and
# name the key, never the value. These four keys cover it: compose.deploy.yml
# builds DATABASE_URL from POSTGRES_PASSWORD.
for key in SESSION_SECRET POSTGRES_PASSWORD GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY; do
  if grep -qsE "^[[:space:]]*(export[[:space:]]+)?$key=[[:space:]]*[\"']?(ft_local_dev|dev-only-|ci-only-)" .env; then
    echo "deploy.sh: $key in .env is a value this repo publishes, not deploying (docs/operations/deployment.md)" >&2
    exit 1
  fi
done

# Each overlay next to this script changes the host: monitoring runs here, and
# another proxy owns 80 and 443 here. Every command below takes both, so the
# pull, the revision check and the deployed state cover the monitoring images.
COMPOSE=(-f compose.deploy.yml)
[ ! -f compose.deploy.monitoring.yml ] || COMPOSE+=(-f compose.deploy.monitoring.yml)
[ ! -f compose.deploy.proxy.yml ] || COMPOSE+=(-f compose.deploy.proxy.yml)
# What was last deployed *successfully*. Comparing against the pre-pull state
# instead would mark a failed deploy as done and never retry it.
STATE=.deployed
OURS='ghcr.io/victorbro/ft_transcendence/'

dc() { docker compose "${COMPOSE[@]}" --profile migrate "$@"; }

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

# Every tick, before the pull, not only after a good deploy: while migrate kept
# failing (Nov 2026), each release pulled ~3 GB that the prune at the end never
# reached, and 11 days of retries filled the disk. Dangling images only: an
# image a container still runs is kept.
docker image prune -f >/dev/null

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
docker compose "${COMPOSE[@]}" up -d

# Only now is this state known good.
echo "$current" >"$STATE"

# The images just replaced are now dangling, and the boot volume is 46 GB.
docker image prune -f
