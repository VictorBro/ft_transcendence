#!/usr/bin/env bash
#
# Runs the Playwright CLI in CI inside Playwright's own image, which carries
# the browsers its version pins and every system package they need. A job then
# installs nothing from the runner's apt mirror, which some days served
# WebKit's packages so slowly that the job timed out before any test.
#
#   ./scripts/playwright-in-image.sh test --project=webkit
#
# From the repo root, which is mounted at its own path, so node_modules and
# compose's project directory resolve as they do on the runner. The image's tag
# follows @playwright/test. Node is the runner's, the one .nvmrc pins: the
# image brings its own, a major ahead. The suite's environment goes in by
# name. The restart spec runs `docker compose`, so the runner's docker CLI,
# its compose plugin and the socket go in too.
set -euo pipefail

version=$(node -p "require('./e2e/package.json').devDependencies['@playwright/test']")
image="mcr.microsoft.com/playwright:v${version}-noble"
node_home=$(dirname "$(dirname "$(command -v node)")")
socket=/var/run/docker.sock
compose=$(docker info --format '{{range .ClientInfo.Plugins}}{{if eq .Name "compose"}}{{.Path}}{{end}}{{end}}')
: "${compose:?the docker compose plugin was not found}"

env_args=()
# The GITHUB_ ones place failure annotations on repo paths and link the report.
for name in CI GITHUB_ACTIONS GITHUB_WORKSPACE GITHUB_SERVER_URL GITHUB_REPOSITORY GITHUB_SHA GITHUB_RUN_ID \
  E2E_BASE_URL E2E_PART E2E_RESTART \
  SIGNUP_LIMIT_PER_MINUTE LOGIN_LIMIT_PER_MINUTE \
  COMPOSE_FILE COMPOSE_PROJECT_NAME SESSION_SECRET GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY; do
  # An unset one stays unset: docker passes only what this shell has.
  env_args+=(-e "$name")
done

# The runner's user, so the report and the results stay the runner's files;
# HOME is set since that user has none in the image. The runner's /tmp, as
# when Playwright ran on the runner: the signup budget's log there spans the
# suite and the restart run.
exec docker run --rm --init --ipc=host --network host \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g "$socket")" \
  -v /tmp:/tmp -e HOME=/tmp "${env_args[@]}" \
  -v "$node_home:$node_home:ro" \
  -e PATH="$node_home/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  -v "$PWD:$PWD" -w "$PWD/e2e" \
  -v "$socket:$socket" \
  -v "$(command -v docker):/usr/bin/docker:ro" \
  -v "$compose:/usr/libexec/docker/cli-plugins/docker-compose:ro" \
  "$image" ./node_modules/.bin/playwright "$@"
