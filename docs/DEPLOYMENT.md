# Deploying to Oracle Cloud

Live at **https://transcendence.dpdns.org** on `140.238.209.2`. Grafana is at
**https://transcendence.dpdns.org/grafana** ([MONITORING.md](MONITORING.md)).

Three files go on the server. Everything else comes from `ghcr.io`, which is public, so the
host needs no registry login and no checkout.

| On the host | From the repo |
| --- | --- |
| `compose.deploy.yml` | `compose.deploy.yml` |
| `Caddyfile` | `infra/caddy/Caddyfile.prod` |
| `.env` | `infra/deploy/.env.example`, filled in |

---

## 1. OCI CLI in the devcontainer

A rebuild wipes this, so expect to repeat it.

```bash
sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
python3 -m venv ~/.oci-venv
~/.oci-venv/bin/pip install oci-cli
mkdir -p ~/.local/bin && ln -sf ~/.oci-venv/bin/oci ~/.local/bin/oci
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

```bash
oci session authenticate     # region eu-zurich-1, profile DEFAULT
```

Prints a URL to open on your own machine. Every later command needs `--auth security_token`.
The token lasts about an hour; `oci session refresh --profile DEFAULT` extends it.

---

## 2. Creating the instance

```bash
oci compute instance list --auth security_token --output table \
  --compartment-id "$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)" \
  --query 'data[?"lifecycle-state"!=`TERMINATED`].{name:"display-name",state:"lifecycle-state"}'
```

| Setting | Value |
| --- | --- |
| Shape | `VM.Standard.E2.1.Micro` (always available, 1 GB: see [Memory](#memory)). `VM.Standard.A1.Flex` at 2 OCPU / 12 GB is better but usually "out of host capacity" |
| Image | Canonical Ubuntu 24.04, architecture matching the shape |
| Subnet | public, **"Assign a public IPv4 address" = Yes** |
| SSH | paste your own public key |
| Ingress | 80/tcp, 443/tcp, 443/udp. Nothing else: Grafana is reached through Caddy on 443, so never open 3000, 9090 or 9093 |

Cloud-init, to install Docker at boot. `#cloud-config` must be the first line or the file is
silently ignored. Set `arch=` to `amd64` or `arm64` to match the shape:

```yaml
#cloud-config
package_update: true
package_upgrade: true

runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - usermod -aG docker ubuntu
  - systemctl enable --now docker
```

Do not touch the instance's iptables. Docker publishes ports through `FORWARD`, not `INPUT`,
so the security list is enough, and `iptables -F` with the stack up kills container
networking.

---

## 3. IP changes after a restart

OCI assigns an **ephemeral** IP, which is released when the instance stops.

```bash
oci network public-ip list --auth security_token --output table \
  --compartment-id "$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)" \
  --scope AVAILABILITY_DOMAIN --availability-domain "creI:EU-ZURICH-1-AD-1" \
  --query 'data[].{ip:"ip-address",lifetime:lifetime}'
```

OCI cannot convert in place. Either reserve one (**Instance → Attached VNICs → the VNIC →
IPv4 Addresses → edit → Reserved**, which gives a *different* address) or leave it and fix the
A record if it ever changes.

---

## 4. DNS

| Field | Value |
| --- | --- |
| Type | `A` |
| Name | `@` |
| Value | the public IP |
| TTL | `300` |

Nothing else: no AAAA, no `www`, no MX. Wait for it to resolve before starting the stack, or
Caddy burns a rate-limited Let's Encrypt attempt.

```bash
dig +short A transcendence.dpdns.org
```

---

## 5. Deploying

```bash
ssh -i ~/.ssh/id_ed25519_vic ubuntu@140.238.209.2
```

```bash
scp compose.deploy.yml ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
scp infra/deploy/.env.example ubuntu@140.238.209.2:~/.env
```

Fill in five values, and the Discord webhook if alerts should reach a channel; the rest of the
template is already correct.

| Key | Value |
| --- | --- |
| `ACME_EMAIL` | a real address |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, **hex not base64**: it goes into `DATABASE_URL` and a `/` breaks the parse |
| `GRAFANA_ADMIN_PASSWORD` | `openssl rand -hex 24`. Applied only when the `grafana-data` volume is created; changing it later needs a reset ([MONITORING.md](MONITORING.md) section 2) |
| `GRAFANA_SECRET_KEY` | `openssl rand -hex 32`. Set once: changing it breaks what Grafana has encrypted |
| `DISCORD_WEBHOOK_URL` | optional. Empty: alerts are only visible in Grafana |

On the server, so the secrets stay out of your shell history:

```bash
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
```

The webhook is pasted, not generated, so a literal in a `sed` line would land in
`~/.bash_history`. Read it without echo instead: paste, then Enter. A Discord webhook URL
contains `/` but never `|`.

```bash
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

On a 1 GB shape, add swap before the first `up` ([Memory](#memory)).

```bash
docker compose -f compose.deploy.yml --profile migrate pull
docker compose -f compose.deploy.yml --profile migrate run --rm migrate
docker compose -f compose.deploy.yml up -d
```

`--profile migrate` on the pull is required, or the tooling image that runs the migration is
skipped. `migrate` applies the migrations, then runs `db:seed`: the question bank and the
lessons ship as files in `content/`, so a fresh database needs them before the app is usable.
Both upsert on the authored ids, so the seed is safe on every redeploy. On success it ends with
`seeded N questions` and `seeded N lessons`, where `N lessons` counts only new or changed rows.
It fails, and writes nothing, if the database holds a lesson that no file has: a shipped
lesson is edited or moved, never deleted.

```bash
docker compose -f compose.deploy.yml ps
curl -sS https://transcendence.dpdns.org/api/health
curl -sS https://transcendence.dpdns.org/grafana/api/health
docker compose -f compose.deploy.yml logs caddy    # if the certificate fails
```

---

## Redeploying

Same three commands. Migrate before `up -d` so the schema is in place when the new code
starts.

`IMAGE_TAG` defaults to `latest`, which follows `main`. Pin it to a `main-<sha>` tag in `.env`
to hold or roll back a release. With this compose file the oldest tag that works is the #129
merge. To go further back, copy that commit's compose file to the server first
(`git show <sha>:compose.deploy.yml`), or the pull fails on the monitoring images.

---

## Automatic deploys

A timer on the box pulls every five minutes and redeploys only when an image moved. Pull-based
rather than GitHub Actions connecting inward, so no deploy credential exists to leak.

```bash
scp infra/deploy/deploy.sh ubuntu@140.238.209.2:~/
scp infra/deploy/ft-deploy.{service,timer} ubuntu@140.238.209.2:~/
```

On the server:

```bash
chmod +x ~/deploy.sh
sudo mv ~/ft-deploy.service ~/ft-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ft-deploy.timer
```

```bash
systemctl list-timers ft-deploy.timer     # when it next fires
sudo systemctl start ft-deploy.service    # run it now
journalctl -u ft-deploy.service -n 50     # what it did
```

Most runs print `no change` and stop before starting anything. To freeze deploys, pin
`IMAGE_TAG` to a `main-<sha>` in `.env`; the timer keeps running and keeps finding nothing.

Prometheus, Alertmanager and Grafana are images built by images.yml with their config inside, so
a rule or a dashboard merged to `main` deploys like code. A change to `compose.deploy.yml` or
`Caddyfile.prod`, exporter pins included, still needs the `scp` and `up -d` by hand, plus
`docker compose -f compose.deploy.yml restart caddy` for the Caddyfile: Caddy reads it only at
start, and `up -d` does not recreate caddy for a changed file.

---

## Memory

The shape in use is most likely `VM.Standard.E2.1.Micro`: 1 GB of RAM and a fraction of a
shared core. The app (Postgres, Redis, Next, Nest, Caddy) takes roughly 450 MB, and monitoring
adds an estimated 330 to 450 MB. Measure before trusting any of it:

```bash
free -m                     # total, available, swap
docker stats --no-stream    # per container, against its limit
uname -m; nproc
```

Every monitoring service has a hard `mem_limit`, 800 MB together, so a runaway one is
OOM-killed and restarted instead of the kernel picking the app.

| Service | `mem_limit` | Idle |
| --- | --- | --- |
| prometheus | 256m | 80 to 150 MB, estimated |
| grafana | 320m | about 180 MB, measured |
| alertmanager | 64m | 15 to 25 MB, estimated |
| node-exporter, postgres-exporter | 48m each | 10 to 20 MB each, estimated |
| redis-exporter, blackbox-exporter | 32m each | 8 to 15 MB each, estimated |

Prometheus and Grafana also get a quarter of the default CPU weight (`cpu_shares: 256`), so
on a shared core they yield to the app. Prometheus keeps at most 15 days or 1 GB on disk.

On a 1 GB box, add a 2 GB swapfile before monitoring starts:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```

The `/etc/fstab` line keeps it across reboots. The `HostMemoryLow` alert counts swap, so a box
that sits near 90% of RAM with swap to spare does not post to Discord every hour.

---

## Enabling monitoring on the running server

Once, for the server that predates monitoring. Order matters, because the server's
`compose.deploy.yml` only changes by hand.

**1. Wait for the images.** After the merge, images.yml on `main` publishes `prometheus`,
`alertmanager` and `grafana` with the `latest` tag. A new GHCR package can start private, and
the server has no registry login, so check from the server that all three are public, like
`api`, `web` and `tooling`. Otherwise `deploy.sh` stalls on the pull.

```bash
for i in prometheus alertmanager grafana; do
  docker buildx imagetools inspect "ghcr.io/victorbro/ft_transcendence/$i:latest" >/dev/null && echo "$i ok"
done
```

**2. Measure.** `free -m`, `uname -m`, `nproc` and `docker stats --no-stream`. If total memory
is about 1 GB, add the swapfile first ([Memory](#memory)).

**3. Add the keys to `.env`.** Before the new compose file: it refuses to start without the two
Grafana keys, and that would stop `deploy.sh` too. The server's `.env` predates them, and
`sed` changes nothing on a missing line, so append them empty first, after a final newline if
the file lacks one:

```bash
[ -z "$(tail -c1 .env)" ] || echo >> .env
grep -q '^GRAFANA_ADMIN_PASSWORD=' .env || printf '%s=\n' GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY DISCORD_WEBHOOK_URL >> .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Run the two Grafana lines once. A second run writes a password Grafana never applies, and a key
that no longer opens what it encrypted.

**4. Roll out.** From the repo:

```bash
scp compose.deploy.yml ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
```

On the server, run the deploy now instead of waiting for the timer, then restart caddy:

```bash
sudo systemctl start ft-deploy.service
journalctl -u ft-deploy.service -n 50
docker compose -f compose.deploy.yml restart caddy
```

Not the three compose commands by hand: the timer sees the new images within five minutes and
runs them too, and two `up -d` at once can fail on container names. `start` waits for the
deploy, and joins a run the timer has already begun instead of starting a second one. The log
should show `deploying <sha>`, or `no change` when a tick got there first. On
`release still publishing`, wait and run it again.

The restart loads the new Caddyfile, with `/grafana` and the metrics site: `up -d` leaves
caddy running on the old one.

**5. Check.** Open https://transcendence.dpdns.org/grafana and log in as `admin`, with the
password from `grep GRAFANA_ADMIN_PASSWORD .env`. Overview should be green. With a webhook set,
send a test alert ([MONITORING.md](MONITORING.md) section 4, with
`docker compose -f compose.deploy.yml` in place of `docker compose`). Then watch `free -m` and
`docker stats --no-stream` for a day before trusting the limits.

**6. Backing out.** If the box swaps hard or OOM-kills the app, put the compose file from before
monitoring back. From the repo:

```bash
git show <merge-sha>~1:compose.deploy.yml > /tmp/compose.deploy.yml
scp /tmp/compose.deploy.yml ubuntu@140.238.209.2:~/compose.deploy.yml
```

On the server:

```bash
docker compose -f compose.deploy.yml up -d --remove-orphans
```

That removes the seven monitoring containers and keeps their volumes and the new Caddyfile, so
`/grafana` answers 502. The obvious ways do not stick: `docker compose stop` is undone by
`deploy.sh`'s `up -d` on the next release, and pinning `IMAGE_TAG` to a `main-<sha>` from before
monitoring fails the pull while the new compose file is in place.

Until step 4, and after step 6, the server runs the old compose file with the new api image. That
is harmless: the api's metrics port listens on the network and nothing scrapes it.

---

## Behind another reverse proxy

For a host where another reverse proxy already owns 80 and 443, like the shared Infomaniak VPS:
there `caddy-docker-proxy` serves several projects and routes by Docker labels on containers
that join its `web` network. Our stack runs live at **https://trans.vyantares.ch** that way,
next to the Oracle deployment above.

`compose.deploy.proxy.yml` makes the difference. Our Caddy publishes no port, joins the front
proxy's network, and carries the two labels that route `SITE_DOMAIN` to it. It serves plain
HTTP on that hop, since the front proxy holds the certificate, and keeps all its own routing
(`/api`, `/grafana`, the metrics site). It also trusts the front proxy's forwarded address, so
the API's rate limits and Grafana's login lockout still see each visitor, not the proxy.

| On the host | From the repo |
| --- | --- |
| `compose.deploy.yml` | `compose.deploy.yml` |
| `compose.deploy.proxy.yml` | `compose.deploy.proxy.yml` |
| `Caddyfile` | `infra/caddy/Caddyfile.prod` |
| `.env` | `infra/deploy/.env.example`, filled in |
| `deploy.sh` | `infra/deploy/deploy.sh`: uses the overlay when it is present |

**DNS.** An A record for the name to the host's address. On Cloudflare, make it **DNS only**
(grey cloud): proxied, the front proxy sees Cloudflare's addresses, does not trust them, and
every visitor behind one Cloudflare edge would share a rate limit and a lockout.

**Files**, in their own directory, since the home directory holds other projects:

```bash
ssh AntaresVps mkdir -p ft_transcendence
scp compose.deploy.yml compose.deploy.proxy.yml infra/deploy/deploy.sh \
  infra/deploy/ft-deploy.{service,timer} AntaresVps:ft_transcendence/
scp infra/caddy/Caddyfile.prod AntaresVps:ft_transcendence/Caddyfile
scp infra/deploy/.env.example AntaresVps:ft_transcendence/.env
```

**`.env`**: as in [Deploying](#5-deploying), with `SITE_DOMAIN` the new name. `ACME_EMAIL` is
still required but unused: the front proxy requests the certificate. Set `PROXY_NETWORK` if the
front proxy's network is not called `web`. On a host where someone has run a checkout of this
repo, set `COMPOSE_PROJECT_NAME=ft_transcendence_prod`: compose would otherwise take the
checkout's project name, and its volumes with it, database included. The shared VPS has one.

**Deploy** with the script, which adds the overlay itself:

```bash
cd ~/ft_transcendence && chmod +x deploy.sh && ./deploy.sh
```

**Automatic deploys**: the units name the Oracle user and paths, so rewrite them before
installing:

```bash
cd ~/ft_transcendence
sed -i "s|^User=.*|User=$USER|; s|/home/ubuntu|$HOME/ft_transcendence|g" ft-deploy.service
sudo mv ft-deploy.service ft-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ft-deploy.timer
```

**Check**: the front proxy picks the labels up on its own and requests the certificate within a
minute of the first request.

```bash
curl -sS https://trans.vyantares.ch/api/health
curl -sS https://trans.vyantares.ch/grafana/api/health
docker logs caddy 2>&1 | grep trans.vyantares.ch    # the front proxy, if the certificate fails
```
