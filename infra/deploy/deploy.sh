#!/usr/bin/env bash
# Redeploy when a released image moves. Driven by ft-deploy.timer.
#
# Pull-based on purpose: the server reaches out to a public registry, so there is
# no deploy key in GitHub and nothing inbound to expose.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE=compose.deploy.yml

dc() { docker compose -f "$COMPOSE" --profile migrate "$@"; }

# Local id of every image the stack references, profiled ones included.
resolve() {
  dc config --images | sort -u | while read -r ref; do
    # inspect prints a blank line before failing, so the id is taken separately
    # rather than inline with a fallback.
    # `|| true` matters: pipefail plus set -e would abort on the first image
    # this host has not pulled yet, which is every image on a fresh box.
    id=$(docker image inspect -f '{{.Id}}' "$ref" 2>/dev/null | head -1) || true
    printf '%s %s\n' "$ref" "${id:-absent}"
  done
}

before=$(resolve)
dc pull --quiet
after=$(resolve)

# Most runs find nothing. Spinning up the migrate container anyway would cost
# more than the check on a shared-core box.
if [ "$before" = "$after" ]; then
  echo "no change"
  exit 0
fi

echo "changed:"
diff <(echo "$before") <(echo "$after") || true

# Schema first: a container booting against a schema it predates fails in ways
# that are harder to read than a failed migration. set -e stops here on failure,
# so the running stack is left alone.
dc run --rm migrate

# No --profile here, or compose would start the one-shot migrate as a service.
docker compose -f "$COMPOSE" up -d

# The images just replaced are now dangling, and the boot volume is 46 GB.
docker image prune -f
