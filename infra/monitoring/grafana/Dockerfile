# Upstream Grafana with the security settings, datasources and dashboards
# baked in, so dev, CI and the server run the same ones. Pin and reasoning in
# docs/VERSIONS.md.
FROM grafana/grafana:13.2.4 AS prod
COPY grafana.ini /etc/grafana/grafana.ini
COPY provisioning/ /etc/grafana/provisioning/
COPY dashboards/ /etc/grafana/dashboards/
# Replaces the upstream /run.sh as entrypoint, and so clears its CMD too.
COPY --chmod=0755 entrypoint.sh /usr/local/bin/ft-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/ft-entrypoint.sh"]
