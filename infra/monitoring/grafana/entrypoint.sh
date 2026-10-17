#!/bin/sh
# Grafana skips an empty GF_ variable (setting.go only applies len > 0) and
# keeps its built-in admin/admin, then creates the admin with that on first
# boot. Refuse to start instead. Does not support the __FILE variants, which
# nothing here uses.
set -eu

refuse() {
  echo "grafana: $1 is empty or the default. Run make, which writes one into .env, or set it there." >&2
  exit 1
}

[ -n "${GF_SECURITY_ADMIN_PASSWORD:-}" ] || refuse GRAFANA_ADMIN_PASSWORD
[ "$GF_SECURITY_ADMIN_PASSWORD" != admin ] || refuse GRAFANA_ADMIN_PASSWORD
[ -n "${GF_SECURITY_SECRET_KEY:-}" ] || refuse GRAFANA_SECRET_KEY

# The upstream entrypoint, which ends in `exec grafana server`.
exec /run.sh "$@"
