#!/usr/bin/env bash
#
# Did anything call the LLM since SINCE? `make` runs this after the browser
# suite, with SINCE at its own start. Every step of `make` runs on the fixture
# tutor with no key, which counts nothing below, so any increase in that window
# is a step that spent the key, or a person using the stack meanwhile (the
# stack from before keeps running while `make ci` does).
#
# Two series, both on a provider that leaves the machine (not fixture, not
# disabled):
#   ft_llm_requests_total   every call that ends, ok or failed: question
#                           restocks and the lesson tutor
#   ft_llm_checks_total     the tutor's key checks (POST /api/tutor/check)
# A tutor answer the learner leaves mid-stream, or whose reader stops early,
# counts no outcome (gemini.provider.ts), so it is not seen here.
# Every label set of both starts at 0 when the api starts (gemini.provider.ts,
# tutor.service.ts), so increase() sees a first call. No series at all, as on a
# stack that never ran a real provider, counts as 0.
#
# The window reaches one scrape interval before SINCE. increase() takes the
# first sample in its window as the baseline, so a call between SINCE and the
# first scrape after it would be in that baseline and never counted. One
# interval earlier, the baseline is a scrape from before SINCE. 5 s more, since
# Prometheus ends the window at its own now, a second or two after the script
# counts it. The price is a call up to one interval and 5 s before SINCE
# counted too: a false alarm, never a miss. Still missed: an api started
# inside the window on a real provider, with none on it earlier in the window,
# that calls before its first scrape, since Prometheus never saw its 0. No step of `make` starts one: `run` starts
# the fixture, and the last `up` comes after this check.
#
#   SINCE=<epoch seconds> ./scripts/check-llm-spend.sh
#   make llm-spend-check SINCE=$(date -d '1 hour ago' +%s)
#
# COMPOSE as for check-monitoring.sh. Needs jq. Fails, never passes, when it
# cannot see: Prometheus not answering, or no scrape of the api after the suite.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

case "${SINCE:-}" in
  '' | *[!0-9]*)
    echo 'check-llm-spend: SINCE must be the start of the window, in epoch seconds' >&2
    exit 2
    ;;
esac

COMPOSE="${COMPOSE:-docker compose --profile monitoring}"
# scrape_interval in infra/monitoring/prometheus/prometheus.yml.
SCRAPE_SECONDS=30
# Wait up to two intervals for the scrape that follows the suite, or its last
# calls are not counted yet.
WAIT_SECONDS=$((2 * SCRAPE_SECONDS + 10))
# The providers that call nothing.
OFFLINE='fixture|disabled'

# shellcheck disable=SC2086 # COMPOSE is a command line, split on purpose
compose() { $COMPOSE "$@"; }

# Inside the devcontainer the compose network resolves prometheus, so the query
# goes there directly: through the devcontainer's socket bridge, a `docker
# exec` whose stdin is closed can end early with no output. Elsewhere through
# the container, as check-monitoring.sh does.
if [ -f /.dockerenv ] && curl -fsS --max-time 5 -o /dev/null http://prometheus:9090/-/ready 2>/dev/null; then
  query() { curl -fsS --max-time 10 --get --data-urlencode "query=$1" http://prometheus:9090/api/v1/query; }
else
  query() { compose exec -T prometheus wget -qO- "http://127.0.0.1:9090/api/v1/query?query=$(jq -rn --arg q "$1" '$q | @uri')"; }
fi

# The answer to a query, or the end of the script: an empty or failed answer
# must never read as 0.
answer() {
  local body
  if body="$(query "$1")" && jq -e '.status == "success"' <<<"$body" >/dev/null 2>&1; then
    printf '%s\n' "$body"
  else
    echo 'FAIL  check-llm-spend: Prometheus did not answer: is the stack up with monitoring?' >&2
    exit 1
  fi
}

# A single-sample query's value; no sample is 0.
value() { answer "$1" | jq -r '.data.result[0].value[1] // "0"'; }

# One line per label set that moved, for the failure message.
breakdown() {
  answer "$1" | jq -r '.data.result[]
    | "      \(.value[1] | tonumber | . + 0.5 | floor)  \(.metric | to_entries | map("\(.key)=\(.value)") | join(" "))"'
}

positive() { awk -v v="$1" 'BEGIN { exit !(v > 0) }'; }

end="$(date +%s)"
# GNU date, then BSD date (macOS), then the raw number.
since_text="$(date -d "@$SINCE" '+%F %T' 2>/dev/null || date -r "$SINCE" '+%F %T' 2>/dev/null || echo "$SINCE")"
printf 'Checking LLM calls since %s (waiting up to %ss for the next scrape)\n\n' "$since_text" "$WAIT_SECONDS"
while :; do
  latest="$(value 'max(timestamp(up{job="api"}))')"
  [ "${latest%%.*}" -ge "$end" ] && break
  if [ "$(date +%s)" -ge "$((end + WAIT_SECONDS))" ]; then
    printf 'FAIL  check-llm-spend: Prometheus has not scraped the api for %ss, so its last calls are not counted\n' \
      "$WAIT_SECONDS" >&2
    exit 1
  fi
  sleep 2
done

seconds=$(($(date +%s) - SINCE))
[ "$seconds" -ge 1 ] || seconds=1
# One scrape and 5 s before SINCE, for the baseline (see the top of this file).
window="$((seconds + SCRAPE_SECONDS + 5))s"
selector="provider!~\"$OFFLINE\""
requests_q="sum by (provider, model, purpose, outcome) (increase(ft_llm_requests_total{$selector}[$window])) > 0"
checks_q="sum by (provider, model, status) (increase(ft_llm_checks_total{$selector}[$window])) > 0"

requests="$(value "sum(increase(ft_llm_requests_total{$selector}[$window])) or vector(0)")"
checks="$(value "sum(increase(ft_llm_checks_total{$selector}[$window])) or vector(0)")"
# increase() extrapolates to the window's edges, so one call can read 1.03.
round() { awk -v v="$1" 'BEGIN { printf "%.0f", v }'; }

if positive "$requests" || positive "$checks"; then
  printf 'FAIL  the LLM was called since %s (window %s, one scrape before it included): %s requests, %s key checks\n' \
    "$since_text" "$window" "$(round "$requests")" "$(round "$checks")" >&2
  positive "$requests" && breakdown "$requests_q" >&2
  positive "$checks" && breakdown "$checks_q" >&2
  cat >&2 <<'EOF'

A step ran on a real provider, or someone used the tutor, a placement exam or
Test connection on the stack meanwhile. Grafana's LLM panels show when.
EOF
  exit 1
fi

printf 'ok    %s LLM requests and %s key checks on a real provider since %s (window %s)\n' \
  "$(round "$requests")" "$(round "$checks")" "$since_text" "$window"
