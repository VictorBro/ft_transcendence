#!/usr/bin/env bash
#
# Static checks for the monitoring configs. Each is only parsed when its
# container starts, so a typo would otherwise surface as a crash loop in e2e,
# or as an alert that silently never fires. Uses the validators shipped in the
# pinned images, so the check and the runtime agree on the syntax.
#
#   ./scripts/check-monitoring-config.sh
#
# Needs docker and jq. It never prints a resolved compose config: compose
# interpolates the local .env into it, secrets included.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Bind mounts resolve on the docker daemon's side, which from the devcontainer
# is the host: same reason compose.yml prefixes LOCAL_WORKSPACE_FOLDER.
host_root="${LOCAL_WORKSPACE_FOLDER:-$repo_root}"
mon="$host_root/infra/monitoring"

MONITORING_SERVICES=(
  prometheus alertmanager grafana
  node-exporter postgres-exporter redis-exporter blackbox-exporter
)
# Upstream images that compose.deploy.yml repeats by hand.
PINNED_SERVICES=(caddy db redis node-exporter postgres-exporter redis-exporter blackbox-exporter)

failures=0

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'ok    %s\n' "$1"
}

indent() { sed 's/^/      /' >&2; }

# Runs a validator: quiet when it passes, its own output indented when not.
check() {
  local what="$1" output
  shift
  if output="$("$@" 2>&1)"; then
    pass "$what"
  else
    fail "$what"
    printf '%s\n' "$output" | indent
  fi
}

# Pins are read from where they live, never repeated here.
base_image() {
  sed -n 's/^FROM \([^ ]*\).*/\1/p' "infra/monitoring/$1/Dockerfile" 2>/dev/null | head -1
}
prometheus_image="$(base_image prometheus)"
alertmanager_image="$(base_image alertmanager)"
caddy_image="$(sed -n 's/^ *image: *\(caddy:[^ ]*\)$/\1/p' compose.yml | head -1)"

if [ -z "$prometheus_image" ] || [ -z "$alertmanager_image" ] || [ -z "$caddy_image" ]; then
  printf 'FAIL  no image pin in infra/monitoring/*/Dockerfile or compose.yml\n' >&2
  exit 1
fi

# The validators read only the files mounted into them.
run() { docker run --rm --network none "$@"; }

printf 'Checking the monitoring configs\n\n'

# --- 1 to 4. Prometheus and Alertmanager -------------------------------------
promtool() {
  run -v "$mon/prometheus:/etc/prometheus:ro" --entrypoint /bin/promtool "$prometheus_image" "$@"
}
amtool() {
  run -v "$mon/alertmanager:/etc/alertmanager:ro" --entrypoint /bin/amtool "$alertmanager_image" "$@"
}

# Parses every rule file the config names as well.
check "prometheus.yml and its rules" \
  promtool check config --lint-fatal /etc/prometheus/prometheus.yml
check "alert rule unit tests" \
  promtool test rules /etc/prometheus/tests/alerts.test.yml
check "alertmanager.yml, silent.yml and the templates" \
  amtool check-config /etc/alertmanager/alertmanager.yml /etc/alertmanager/silent.yml
for labels in "alertname=ApiDown severity=critical" "alertname=HostDiskAlmostFull severity=warning"; do
  # shellcheck disable=SC2086 # one argument per label
  check "$labels routes to discord" amtool config routes test \
    --config.file=/etc/alertmanager/alertmanager.yml --verify.receivers=discord $labels
done

# --- 5. Caddyfiles -----------------------------------------------------------
# Also what proves the global `metrics` option parses on the pinned Caddy.
for file in Caddyfile Caddyfile.prod; do
  check "infra/caddy/$file" run \
    -e SITE_DOMAIN=example.com -e ACME_EMAIL=ops@example.com \
    -v "$host_root/infra/caddy/$file:/etc/caddy/Caddyfile:ro" \
    "$caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
done
# The values compose.deploy.proxy.yml gives it.
check "infra/caddy/Caddyfile.prod behind a front proxy" run \
  -e SITE_DOMAIN=http://example.com -e ACME_EMAIL=ops@example.com \
  -e CADDY_TRUSTED_PROXIES=private_ranges \
  -v "$host_root/infra/caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro" \
  "$caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# --- 6. Dashboards -----------------------------------------------------------
# File provisioning cannot fill the ${DS_...} inputs of a dashboard exported
# for sharing, and an id or a duplicate uid makes Grafana skip the file.
DASHBOARD_PROBLEMS='
  (if (.uid | type == "string" and startswith("ft-")) then empty
   else "uid must be a string starting ft-" end),
  (if .id == null then empty else "id must be null" end),
  (if has("__inputs") then "has __inputs: export with \"use in another instance\" off"
   else empty end),
  (if (.title | type == "string" and length > 0) then empty else "no title" end),
  ([.. | objects | select(has("datasource")) | .datasource | strings]
    | unique[] | "datasource \"\(.)\" is a name, not {\"type\", \"uid\"}"),
  ([.. | objects | .datasource? | objects | .uid]
    | map(select(. != "prometheus" and . != "alertmanager" and . != "-- Grafana --"))
    | unique[] | "unknown datasource uid \(tojson)")
'

shopt -s nullglob
dashboards=(infra/monitoring/grafana/dashboards/*.json)
shopt -u nullglob

[ "${#dashboards[@]}" -gt 0 ] || fail "no dashboards in infra/monitoring/grafana/dashboards"

for file in "${dashboards[@]}"; do
  if ! problems="$(jq -r "$DASHBOARD_PROBLEMS" "$file" 2>&1)"; then
    fail "$file is not valid JSON"
    printf '%s\n' "$problems" | indent
  elif [ -n "$problems" ]; then
    fail "$file"
    printf '%s\n' "$problems" | indent
  else
    pass "$file"
  fi
done

if [ "${#dashboards[@]}" -gt 0 ]; then
  duplicates="$(jq -r '.uid' "${dashboards[@]}" 2>/dev/null | sort | uniq -d)"
  if [ -z "$duplicates" ]; then
    pass "dashboard uids are unique"
  else
    fail "dashboard uids used twice: $(echo "$duplicates" | tr '\n' ' ')"
  fi
fi

home="$(sed -n 's/^default_home_dashboard_path *= *//p' infra/monitoring/grafana/grafana.ini \
  2>/dev/null | head -1)"
if [ -n "$home" ] && [ -f "infra/monitoring/grafana/dashboards/${home#/etc/grafana/dashboards/}" ]; then
  pass "the home dashboard exists"
else
  fail "default_home_dashboard_path in grafana.ini is not a file in infra/monitoring/grafana/dashboards"
fi

# --- 7. Compose topologies and what they expose ------------------------------
# Placeholders for every value a topology requires (:?). Set here, they win
# over the local .env, which compose still reads for everything else.
prod_compose() {
  SESSION_SECRET=check GRAFANA_ADMIN_PASSWORD=check GRAFANA_SECRET_KEY=check \
    docker compose -f compose.yml -f compose.prod.yml "$@"
}
deploy_compose() {
  SITE_DOMAIN=example.com ACME_EMAIL=ops@example.com POSTGRES_PASSWORD=check \
    SESSION_SECRET=check LLM_PROVIDER=fixture \
    GRAFANA_ADMIN_PASSWORD=check GRAFANA_SECRET_KEY=check \
    docker compose -f compose.deploy.yml --profile migrate "$@"
}

# Never printed, on success or failure: see the header.
prod_json='' deploy_json='' proxy_json='' dev_json=''
prod_json="$(prod_compose config --format json)" ||
  fail "compose.yml + compose.prod.yml do not resolve"
deploy_json="$(deploy_compose config --format json)" ||
  fail "compose.deploy.yml does not resolve"
proxy_json="$(deploy_compose -f compose.deploy.proxy.yml config --format json)" ||
  fail "compose.deploy.yml + compose.deploy.proxy.yml do not resolve"
dev_json="$(docker compose --profile monitoring config --format json)" ||
  fail "compose.yml + compose.override.yml do not resolve with the monitoring profile"

# Service names only, sorted, space-separated.
publishers() {
  jq -r '[.services | to_entries[] | select((.value.ports // []) | length > 0) | .key]
    | sort | join(" ")' <<<"$1"
}
# The container ports caddy publishes, so never the :2020 metrics site.
caddy_ports() {
  jq -r '[.services.caddy.ports[]?.target] | unique | map(tostring) | join(" ")' <<<"$1"
}

expect_publishers() {
  local name="$1" json="$2" want="$3" got
  [ -n "$json" ] || return 0
  got="$(publishers "$json")"
  if [ "$got" = "$want" ]; then
    pass "$name: ports published by $want only"
  else
    fail "$name: services publishing ports are [$got], expected [$want]"
  fi
  got="$(caddy_ports "$json")"
  if [ "$got" = "80 443" ]; then
    pass "$name: caddy publishes 80 and 443 only"
  else
    fail "$name: caddy publishes container ports [$got], expected [80 443]"
  fi
}

expect_publishers "prod overlay" "$prod_json" "caddy"
expect_publishers "deploy" "$deploy_json" "caddy"

# Behind a front proxy nothing publishes: caddy is reached over its network.
if [ -n "$proxy_json" ]; then
  got="$(publishers "$proxy_json")"
  if [ -z "$got" ]; then
    pass "deploy behind a proxy: no service publishes a port"
  else
    fail "deploy behind a proxy: services publishing ports are [$got], expected none"
  fi
  if jq -e '.services.caddy | .labels.caddy == "example.com" and (.networks | has("proxy"))' \
    <<<"$proxy_json" >/dev/null; then
    pass "deploy behind a proxy: caddy joins the proxy network with its site label"
  else
    fail "deploy behind a proxy: caddy lacks the proxy network or the caddy label"
  fi
fi
# The stores keep their loopback ports in dev (compose.override.yml).
expect_publishers "dev" "$dev_json" "caddy db redis"

# The services whose resolved definition fails the jq condition.
failing_services() {
  local json="$1" condition="$2" service
  for service in "${MONITORING_SERVICES[@]}"; do
    jq -e --arg s "$service" ".services[\$s] | $condition" <<<"$json" >/dev/null ||
      printf '%s ' "$service"
  done
}

# Always on in the prod overlay and the deploy file, opt-in in dev.
always_on() {
  local name="$1" json="$2" missing
  [ -n "$json" ] || return 0
  missing="$(failing_services "$json" 'type == "object" and (.profiles // []) == []')"
  if [ -z "$missing" ]; then
    pass "$name: the monitoring services run without a profile"
  else
    fail "$name: missing or behind a profile: $missing"
  fi
}

always_on "prod overlay" "$prod_json"
always_on "deploy" "$deploy_json"
always_on "deploy behind a proxy" "$proxy_json"

if [ -n "$dev_json" ]; then
  missing="$(failing_services "$dev_json" '.profiles == ["monitoring"]')"
  if [ -z "$missing" ]; then
    pass "dev: the monitoring services sit behind the monitoring profile"
  else
    fail "dev: not behind the monitoring profile: $missing"
  fi
fi

if dev_services="$(docker compose config --services)"; then
  leaked="$(printf '%s\n' "${MONITORING_SERVICES[@]}" |
    grep -Fx -f <(printf '%s\n' "$dev_services") || true)"
  if [ -z "$leaked" ]; then
    pass "dev: none of them starts without the profile"
  else
    fail "dev: started without the profile: $(echo "$leaked" | tr '\n' ' ')"
  fi
else
  fail "compose.yml + compose.override.yml do not resolve"
fi

# --- 8. Entrypoints, in the pinned Alertmanager image's busybox --------------
# Exit status of the Grafana entrypoint under the given -e flags. No Grafana
# pull: past its guards it execs /run.sh, which this image lacks (127).
grafana_guard() {
  local status=0
  run "$@" -v "$mon/grafana/entrypoint.sh:/e.sh:ro" \
    --entrypoint /bin/sh "$alertmanager_image" /e.sh >/dev/null 2>&1 || status=$?
  echo "$status"
}

# The "never admin/admin" promise: Grafana would otherwise fall back to it.
statuses="$(grafana_guard)"
statuses+=" $(grafana_guard -e GF_SECURITY_ADMIN_PASSWORD=admin -e GF_SECURITY_SECRET_KEY=check)"
statuses+=" $(grafana_guard -e GF_SECURITY_ADMIN_PASSWORD=check -e GF_SECURITY_SECRET_KEY=)"
statuses+=" $(grafana_guard -e GF_SECURITY_ADMIN_PASSWORD=check -e GF_SECURITY_SECRET_KEY=check)"
if [ "$statuses" = "1 1 1 127" ]; then
  pass "grafana entrypoint refuses an empty or default password and an empty key"
else
  fail "grafana entrypoint exits [$statuses], expected [1 1 1 127]: empty, admin, no key, valid"
fi

# CI sets no webhook, so nothing else runs this path before the server does.
# --version after the entrypoint's flags exits 0 only if the binary knows every
# one of them, and only after the webhook file was written as nobody.
check "alertmanager entrypoint writes the webhook file and passes known flags" run \
  --tmpfs /run/alertmanager \
  -e DISCORD_WEBHOOK_URL=https://discord.invalid/check -e GRAFANA_URL=https://localhost/grafana \
  -v "$mon/alertmanager:/etc/alertmanager:ro" -v "$mon/alertmanager/entrypoint.sh:/e.sh:ro" \
  --entrypoint /bin/sh "$alertmanager_image" /e.sh --version

# --- 9. Pins in sync ---------------------------------------------------------
# compose.deploy.yml repeats these by hand, and nothing else notices drift.
shape() { jq -c --arg s "$1" '.services[$s] | {image, command}' <<<"$2"; }

if [ -n "$prod_json" ] && [ -n "$deploy_json" ]; then
  drifted=''
  for service in "${PINNED_SERVICES[@]}"; do
    [ "$(shape "$service" "$prod_json")" = "$(shape "$service" "$deploy_json")" ] ||
      drifted+="$service "
  done
  if [ -z "$drifted" ]; then
    pass "compose.deploy.yml runs the same images and commands as compose.yml"
  else
    fail "image or command differs between compose.yml and compose.deploy.yml: $drifted"
  fi
fi

printf '\n'
if [ "$failures" -ne 0 ]; then
  printf '%s check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Monitoring configs are valid.\n'
