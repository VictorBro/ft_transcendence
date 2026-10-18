# Shell Aliases and Functions

For developer convenience, custom shortcuts and functions are defined in [`.devcontainer/zshrc`](file:///workspace/.devcontainer/zshrc).

### `croot`
Brings you back to the project root (`/workspace`) from any folder in your shell.

### `prs`
Lists recent PRs merged into `main` (up to 30) along with their merge date, commit hash, PR number, closed issue references, and PR title.

### `prc [count]`
Lists merged PRs with their originating branch and expands the commit history for each PR.
- Default: shows the last 3 PRs.
- Pass a number argument to view more, e.g., `prc 5`.
- Passing `0` lists all merged PRs.

### `switch <commit-hash> | switch main`
Allows you, from branch `main`, to switch into a specific commit in detached `HEAD` mode. This is useful to inspect or test the codebase at a certain PR merge.
- `switch <commit-hash>`: Checks out `<commit-hash>` in detached `HEAD` mode. **Only permitted when currently on branch `main`**.
- `switch main`: Returns to branch `main`. Permitted from `main` or from a detached `HEAD` that belongs to `main`'s history.

# Monitoring in development

`make dev` leaves the monitoring stack off: its seven services sit behind the `monitoring` compose profile, so a laptop stays light. It also removes the monitoring containers a previous `make` left running, and keeps their data. `make`, `make up` and the server always run it. The full picture is in [MONITORING.md](MONITORING.md).

### `make monitoring-up`
Starts the dev stack plus Prometheus, Alertmanager, Grafana and the exporters. It goes through `make dev`, so migrations, the seed and the certificate export run as usual, and the first run writes the two Grafana secrets into `.env`.
- Grafana: `https://localhost/grafana`, user `admin`, password from `grep GRAFANA_ADMIN_PASSWORD .env`. From a terminal inside the devcontainer, use `https://caddy/grafana`.
- Without it, `/grafana` answers 502.
- `make down`, `make logs` and `make clean` include the monitoring containers, e.g. `make logs SERVICES="prometheus alertmanager"`.

### Editing a rule, a dashboard or the Grafana config
The config under `infra/monitoring/` is baked into three small images, not bind-mounted. Run `make monitoring-up` again after an edit: it rebuilds them in seconds and recreates what changed.
- Rules: `./scripts/check-monitoring-config.sh` runs promtool and the rule unit tests without starting the stack.
- Dashboards: Grafana refuses to save a provisioned dashboard, on purpose. Edit it there, then Export, Export as JSON, **Classic** model, with "Export the dashboard to use in another instance" **off**. Replace the file in `infra/monitoring/grafana/dashboards/`, keep `"id": null` and the uid, run `make format`, then `make monitoring-up`.
- Adding a metric, a panel or an alert has a short checklist each in [MONITORING.md](MONITORING.md) section 7.

### `make monitoring-check`
Every scrape target up, every rule healthy, an Alertmanager found, and every series a rule or panel reads present. It polls for up to 150 s, so it can run straight after `make monitoring-up`. `make` runs it too.

### Reaching Prometheus and the raw metrics
No monitoring port is published, not even on loopback. From a terminal inside the devcontainer, every service answers by name:

```bash
curl -s http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
curl -s http://api:9464/metrics | grep '^ft_'
curl -s http://caddy:2020/metrics | grep caddy_http_requests_total
```

From the host, Grafana's Explore queries Prometheus directly.
