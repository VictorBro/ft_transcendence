#!/usr/bin/env bash
#
# Proves the monitoring stack is wired, not just running: every scrape target
# answers, every rule evaluates, Prometheus has found Alertmanager, and every
# series a rule or a panel reads exists. A misspelt metric does not make a rule
# unhealthy, it makes it silently match nothing; only the last check sees that.
#
#   COMPOSE="docker compose -f compose.yml -f compose.prod.yml" ./scripts/check-monitoring.sh
#
# COMPOSE defaults to the dev file list with the monitoring profile, which
# reaches the containers whichever overlay started them. Needs jq.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

COMPOSE="${COMPOSE:-docker compose --profile monitoring}"

# 7 jobs with one target each, plus 3 blackbox probes (prometheus.yml).
EXPECTED_TARGETS=10
EXPECTED_PROBES=3
TIMEOUT_SECONDS=150
POLL_SECONDS=5

# Present on a healthy idle stack, so an empty answer means a rename or a typo.
# A new rule or panel on such a metric adds it here. Left out on purpose, since
# they only exist after an event: the other ft_llm_* metrics (none under
# the fixture), ft_question_restock_duration_seconds, any 5xx series, and
# ALERTS.
REQUIRED_SERIES=(
  'http_request_duration_seconds_count{job="api"}'
  'http_requests_in_flight{job="api"}'
  'nodejs_eventloop_lag_p99_seconds{job="api"}'
  'ft_app_info'
  'ft_llm_provider_info'
  'ft_users'
  'ft_active_users'
  # After the migrations: the collector reads the bank's table. It caches
  # for 60 s, well inside the timeout.
  'ft_question_bank_questions'
  'ft_placement_exams_total'
  'ft_placement_draws_total'
  'ft_placement_pool_exhausted_total'
  'ft_question_restocks_total'
  'ft_question_restock_failures_total'
  'ft_question_restock_inserted_total'
  # The gauge exists from start, and every label set of the counter is born at
  # 0 (metrics.ts).
  'ft_ws_connections'
  'ft_ws_events_total'
  # Caddy 2.11 counts each request once, under the route's first handler.
  'caddy_http_request_duration_seconds_count{handler="subroute"}'
  'pg_settings_max_connections'
  'pg_stat_database_numbackends'
  'pg_stat_activity_count'
  'redis_aof_last_write_status'
  'redis_keys_count{key="sess:*"}'
  'node_memory_MemAvailable_bytes'
  'node_memory_SwapTotal_bytes'
  'node_cpu_seconds_total'
  'alertmanager_notifications_failed_total'
  'prometheus_notifications_alertmanagers_discovered'
)

# A warning only: Docker Desktop's VM may not report one.
OPTIONAL_SERIES=('node_filesystem_avail_bytes{mountpoint="/"}')

# shellcheck disable=SC2086 # COMPOSE is a command line, split on purpose
compose() { $COMPOSE "$@"; }

# The Prometheus image has busybox wget; jq runs on this side.
prom() { compose exec -T prometheus wget -qO- "http://127.0.0.1:9090/api/v1/$1"; }
query() { prom "query?query=$(jq -rn --arg q "$1" '$q | @uri')"; }
# The value of a single-sample query, empty when there is none.
value() { query "$1" | jq -r '.data.result[0].value[1] // empty'; }

# Not running at all, or restarting: no point waiting out the timeout.
compose ps --status running --services | grep -x prometheus >/dev/null || {
  echo 'FAIL  prometheus is not running: make monitoring-up (dev) or make up (prod)' >&2
  exit 1
}

# One request through the main site, so Caddy's request series exist even on a
# stack nobody has browsed yet. Its answer does not matter, only the count.
compose exec -T caddy wget -q -O /dev/null --no-check-certificate https://localhost/healthz \
  >/dev/null 2>&1 || true

printf 'Checking the monitoring stack (up to %ss)\n\n' "$TIMEOUT_SECONDS"

# Fills `problems`; empty means everything holds.
inspect() {
  problems=()
  local targets rules line count alertmanagers failing series

  if targets="$(prom 'targets?state=active')"; then
    count="$(jq '.data.activeTargets | length' <<<"$targets")"
    [ "$count" -eq "$EXPECTED_TARGETS" ] ||
      problems+=("$count active scrape targets, expected $EXPECTED_TARGETS")
    while IFS= read -r line; do
      [ -n "$line" ] && problems+=("$line")
    done < <(jq -r '.data.activeTargets[] | select(.health != "up")
      | "target \(.labels.job) \(.labels.instance) is \(.health): \(.lastError)"' <<<"$targets")
    # Refused, not unresolved: caddy runs, but without the :2020 site.
    if jq -e '.data.activeTargets[] | select(.labels.job == "caddy" and (.lastError | test("refused")))' \
      <<<"$targets" >/dev/null; then
      problems+=("caddy is probably still running the Caddyfile from before the monitoring change: docker compose restart caddy")
    fi
  else
    problems+=("Prometheus does not answer: is the stack up with monitoring? (make monitoring-up)")
    return
  fi

  if rules="$(prom rules)"; then
    [ "$(jq '[.data.groups[].rules[]] | length' <<<"$rules")" -gt 0 ] || problems+=("no rules loaded")
    # Every rule starts as unknown until its first evaluation.
    while IFS= read -r line; do
      [ -n "$line" ] && problems+=("$line")
    done < <(jq -r '.data.groups[].rules[] | select(.health != "ok")
      | "rule \(.name) is \(.health): \(.lastError // "not evaluated yet")"' <<<"$rules")
  else
    problems+=("Prometheus did not list its rules")
  fi

  alertmanagers="$(prom alertmanagers | jq '.data.activeAlertmanagers | length' || echo 0)"
  [ "$alertmanagers" -ge 1 ] || problems+=("Prometheus has not found Alertmanager")

  # A target can be up while what it reports is down.
  if [ "$(value 'count(probe_success == 1)')" != "$EXPECTED_PROBES" ]; then
    failing="$(query 'probe_success == 0' | jq -r '[.data.result[].metric.instance] | join(", ")' || true)"
    problems+=("not all $EXPECTED_PROBES blackbox probes succeed, failing: ${failing:-none reported yet}")
  fi
  [ "$(value 'pg_up')" = "1" ] || problems+=("postgres-exporter cannot reach the database: pg_up is not 1")
  [ "$(value 'redis_up')" = "1" ] || problems+=("redis-exporter cannot reach redis: redis_up is not 1")

  for series in "${REQUIRED_SERIES[@]}"; do
    [ -n "$(value "count($series)")" ] || problems+=("no series for $series")
  done
}

deadline=$((SECONDS + TIMEOUT_SECONDS))
while :; do
  inspect
  [ "${#problems[@]}" -eq 0 ] && break
  if [ "$SECONDS" -ge "$deadline" ]; then
    printf 'FAIL  %s\n' "${problems[@]}" >&2
    printf '\nThe monitoring stack is not wired after %ss.\n' "$TIMEOUT_SECONDS" >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"
done

printf 'ok    %s scrape targets up\n' "$EXPECTED_TARGETS"
printf 'ok    every rule evaluates\n'
printf 'ok    Alertmanager found\n'
printf 'ok    every probe succeeds, postgres and redis up\n'
printf 'ok    %s required series present\n' "${#REQUIRED_SERIES[@]}"

for series in "${OPTIONAL_SERIES[@]}"; do
  [ -n "$(value "count($series)")" ] || printf 'warn  no series for %s\n' "$series"
done

printf '\nThe monitoring stack is wired.\n'
