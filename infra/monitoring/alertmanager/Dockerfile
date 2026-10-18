# Upstream Alertmanager with the routing config baked in, plus an entrypoint
# that turns DISCORD_WEBHOOK_URL into the file Alertmanager reads. Pin and
# reasoning in docs/VERSIONS.md.
FROM ghcr.io/prometheus/alertmanager:v0.34.1 AS prod
COPY alertmanager.yml silent.yml /etc/alertmanager/
COPY templates/ /etc/alertmanager/templates/
COPY --chmod=0755 entrypoint.sh /usr/local/bin/ft-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/ft-entrypoint.sh"]
# The upstream CMD carries --config.file; passing it twice is a startup error.
CMD []
