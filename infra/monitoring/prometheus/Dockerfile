# Upstream Prometheus with this repo's scrape config and rules baked in: the
# server has no checkout to bind-mount them from (compose.deploy.yml). Pin and
# reasoning in docs/VERSIONS.md. Single stage, named prod so images.yml treats
# it like the app images.
#
# The upstream CMD is kept. Retention lives in prometheus.yml, since the flags
# are deprecated in 3.x, and the lifecycle and admin APIs stay off.
FROM ghcr.io/prometheus/prometheus:v3.13.4 AS prod
COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY rules/ /etc/prometheus/rules/
