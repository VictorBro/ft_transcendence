#!/bin/sh
# Alertmanager never expands environment variables in its config, so the
# Discord webhook reaches it as a file. Without one (CI, a fresh clone),
# silent.yml keeps every alert visible in Grafana and sends nothing, instead
# of failing one notification per alert.
set -eu

umask 077
if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
  printf '%s' "$DISCORD_WEBHOOK_URL" >/run/alertmanager/discord_webhook
  config=/etc/alertmanager/alertmanager.yml
else
  echo "alertmanager: DISCORD_WEBHOOK_URL is empty, alerts are not sent anywhere" >&2
  config=/etc/alertmanager/silent.yml
fi
unset DISCORD_WEBHOOK_URL

# --cluster.listen-address= turns off HA gossip on 9094, which is on by
# default. The external URL is Grafana's alert list, the only alert UI anyone
# can reach; route-prefix keeps the API itself at /.
exec /bin/alertmanager \
  --config.file="$config" \
  --storage.path=/alertmanager \
  --cluster.listen-address= \
  --web.external-url="${GRAFANA_URL:?}/alerting/list" \
  --web.route-prefix=/ \
  "$@"
