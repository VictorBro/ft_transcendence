# Deploying

Two hosts run the app, and both follow `main` on their own ([Automatic deploys](#automatic-deploys)).

| Host | Where | Monitoring |
| --- | --- | --- |
| **https://trans.vyantares.ch**, the primary deployment | A shared Infomaniak VPS, behind its `caddy-docker-proxy`, which holds the certificate ([The primary, behind another reverse proxy](#the-primary-behind-another-reverse-proxy)) | On. Grafana is at **https://trans.vyantares.ch/grafana** ([operations/monitoring.md](monitoring.md)) |
| **https://transcendence.dpdns.org**, a secondary copy | The Oracle Cloud instance on `140.238.209.2` that sections 1 to 5 set up. Our own Caddy gets its certificate | Off: the free-tier VM does not have the memory ([Memory](#memory)). It runs without `compose.deploy.monitoring.yml`, so `/grafana` answers 503 |

Sections 1 to 5 build the Oracle copy from nothing. The primary takes the same files and `.env`,
`SITE_DOMAIN` aside, plus the monitoring and proxy overlays.

Three files go on the server, and a fourth where monitoring runs. Everything else comes from
`ghcr.io`, which is public, so the host needs no registry login and no checkout.

| On the host | From the repo |
| --- | --- |
| `compose.deploy.yml` | `compose.deploy.yml` |
| `Caddyfile` | `infra/caddy/Caddyfile.prod` |
| `.env` | `.env.example`, filled in |
| `compose.deploy.monitoring.yml` | `compose.deploy.monitoring.yml`, only where monitoring runs ([Monitoring on a server](#monitoring-on-a-server)) |

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
| Shape | `VM.Standard.E2.1.Micro` (always available, 1 GB: see [Memory](#memory); the running server has 954 MiB usable and 2 vCPUs, measured on 2026-11-27). `VM.Standard.A1.Flex` at 2 OCPU / 12 GB is better but usually "out of host capacity" |
| Image | Canonical Ubuntu 24.04, architecture matching the shape |
| Subnet | public, **"Assign a public IPv4 address" = Yes** |
| SSH | paste your own public key |
| Ingress | 22/tcp (SSH, for the `ssh` and `scp` below), 80/tcp, 443/tcp, 443/udp. Nothing else: never open 3000, 9090 or 9093 (where monitoring runs, Grafana is reached through Caddy on 443) |

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
scp .env.example ubuntu@140.238.209.2:~/.env
```

`.env.example` is the one template, for a checkout and for a server. It has three sections, and a
server reads the first two: section 3, "checkout only", sits unused there, so editing it changes
nothing. Every required key is empty in the template, and compose refuses to start until each one
is set, so a copied template never runs on a value published in this repo.

Required, the Grafana keys only where monitoring runs:

| Key | Value |
| --- | --- |
| `SITE_DOMAIN` | the public name, here `transcendence.dpdns.org` |
| `ACME_EMAIL` | a real address |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, **hex not base64**: it goes into `DATABASE_URL` and a `/` breaks the parse |
| `LLM_PROVIDER` | `fixture`, `gemini` or `disabled` (below). Empty in the template, and `compose.deploy.yml` refuses to start without it |
| `GRAFANA_ADMIN_PASSWORD` | with monitoring only. `openssl rand -hex 24`. Applied only when the `grafana-data` volume is created; changing it later needs a reset ([operations/monitoring.md](monitoring.md) section 2) |
| `GRAFANA_SECRET_KEY` | with monitoring only. `openssl rand -hex 32`. Set once: changing it breaks what Grafana has encrypted |

Optional:

| Key | Value |
| --- | --- |
| `LLM_API_KEY` | with `gemini` only. Pasted like the webhook, with `read -rs` |
| `DISCORD_WEBHOOK_URL` | with monitoring only. Empty: alerts are only visible in Grafana. Each Discord title starts with `SITE_DOMAIN`, so the team tells the hosts and laptops apart ([operations/monitoring.md](monitoring.md) section 4) |
| `IMAGE_TAG` | `latest` in the template ([Redeploying](#redeploying)) |
| `PROXY_NETWORK` | behind another reverse proxy only ([The primary, behind another reverse proxy](#the-primary-behind-another-reverse-proxy)) |
| `DEMO_PASSWORD` | the six demo learners, rebuilt by each release's seed ([Demo learners](#demo-learners)). Pasted like the webhook, with `read -rs` |

And on every server, uncomment `COMPOSE_PROJECT_NAME=ft_transcendence_prod`. Both of ours run as
`ft_transcendence_prod`, so their `.env` files are the same file but for `SITE_DOMAIN`. On a host
that also has a checkout of this repo, it keeps the two stacks apart: the checkout runs as
`ft_transcendence`, and the same name would share its volumes, database included. Never set it in
a checkout: the Makefile assumes `ft_transcendence`. Compose prefixes each volume with it, so the
database is in `ft_transcendence_prod_pg-data`.

The Oracle copy ran as `ft_transcendence` until 2026-11-27. A new name means new, empty volumes:
its old ones were removed and the database seeded again from zero. Caddy's volume was copied into
`ft_transcendence_prod_caddy-data` first, so Caddy kept its certificate and asked Let's Encrypt
for none.

`deploy.sh` also refuses a `.env` whose `SESSION_SECRET`, `POSTGRES_PASSWORD` or Grafana keys
hold a value this repo publishes for local stacks and CI (`ft_local_dev`, `dev-only-…`,
`ci-only-…`): `:?` in compose only stops an empty one. It names the key, never the value. The
three commands below skip that check; `deploy.sh` runs it on every tick of the timer.

### The LLM provider and its limits

All read by the api at boot. A bad provider, a missing Gemini key or a limit that is not a whole
number stops it, so the typo shows at the deploy, not on the first lesson. `LLM_MODEL` is not
checked: a wrong model id shows as `http_error` on the first call. `compose.yml` and `compose.deploy.yml` pass the same names.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LLM_PROVIDER` | `fixture` locally, through `compose.yml`; on a server none, and empty in the template | `gemini`: the placement bank restocks a cell that runs low, and the lesson discussion answers. `fixture`: no network, no question written, the tutor gives one canned answer; what CI runs. `disabled`: no LLM at all, every discussion message ends with `llm.disabled` |
| `LLM_API_KEY` | empty | The Gemini key, sent in the `x-goog-api-key` header. Required with `gemini` |
| `LLM_MODEL` | empty = `gemini-3.6-flash` | The Gemini model id. Ignored by the other providers |
| `LLM_DISCUSSION_USER_PER_MINUTE` | 5 | Discussion messages per learner per minute |
| `LLM_DISCUSSION_USER_PER_DAY` | 150 | Per learner per day. The window starts at the learner's first message, not at midnight |
| `LLM_DISCUSSION_GLOBAL_PER_MINUTE` | 10 | For everyone together: keep it under the key's per-minute quota (Google AI Studio shows it), which the bank restocks share. If that quota is about 5, set 5 here and 3 per learner |
| `RATE_LIMIT_PER_MINUTE` | 100 | Every HTTP route, per account, or per address when signed out |
| `SIGNUP_LIMIT_PER_MINUTE` | 20 | Signups per address |
| `LOGIN_LIMIT_PER_MINUTE` | 20 | Password and 2FA code checks per address |

Empty means the default. The three discussion limits are counted in Redis before any LLM call;
over one, the api answers 429 with `Retry-After` and `retryAfter` in the body, and
`ft_llm_discussion_limited_total{limit}` counts it ([operations/monitoring.md](monitoring.md) §5).

On the server, so the secrets stay out of your shell history. The `openssl` commands are the
ones the template's comments give:

```bash
sed -i "s|^SITE_DOMAIN=.*|SITE_DOMAIN=transcendence.dpdns.org|" .env
sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=you@example.com|" .env    # a real address
sed -i "s|^# COMPOSE_PROJECT_NAME=|COMPOSE_PROJECT_NAME=|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
# With monitoring only:
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
```

The webhook is pasted, not generated, so a literal in a `sed` line would land in
`~/.bash_history`. Read it without echo instead: paste, then Enter. A Discord webhook URL
contains `/` but never `|`.

```bash
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Then the provider. `fixture` or `disabled` is one line:

```bash
sed -i "s|^LLM_PROVIDER=.*|LLM_PROVIDER=fixture|" .env
```

With Gemini, set the provider and paste the key the same way as the webhook:

```bash
sed -i "s|^LLM_PROVIDER=.*|LLM_PROVIDER=gemini|" .env
read -rs key && sed -i "s|^LLM_API_KEY=.*|LLM_API_KEY=$key|" .env && unset key
```

On a 1 GB shape, add swap before the first `up` ([Memory](#memory)).

```bash
docker compose -f compose.deploy.yml --profile migrate pull
docker compose -f compose.deploy.yml --profile migrate run --rm migrate
docker compose -f compose.deploy.yml up -d
```

Where monitoring runs, each command also takes `-f compose.deploy.monitoring.yml` after
`-f compose.deploy.yml`, as `deploy.sh` does ([Monitoring on a server](#monitoring-on-a-server)).

`--profile migrate` on the pull is required, or the tooling image that runs the migration is
skipped. `migrate` applies the migrations, then runs `db:seed`: the question bank and the
lessons ship as files in `content/`, inside the tooling image, so a fresh database needs them
before the app is usable.

**What the seed loads**, all from files committed to the repo and authored offline:

| From | Into | Rows |
| --- | --- | --- |
| `content/items/*.json` | `QuestionBank`, matched on `sourceId` | the authored questions |
| `content/outlines/*.json` | `Lesson`, one row per entry | 3,990, every entry, written or not |
| `content/briefs/`, `content/lessons/` | `Lesson.brief`, `Lesson.content`, the title and summary, and `ready = true` | 216 ready lessons, the first 12 of each language and level |

`ready` is recomputed on every run from the files alone: a lesson whose files exist and pass
`validateLesson` is ready, every other row is not, and only ready lessons can be proposed or
played. An invalid lesson file stops the lesson half of the seed before it writes any lesson,
naming the id; the questions, seeded first, are already written. Then come the demo learners,
when the server's `.env` sets `DEMO_PASSWORD` ([Demo learners](#demo-learners)).

Both halves upsert on the authored ids, so the seed is safe on every redeploy. On success it ends
with `seeded N questions` and `seeded N lessons`, where `N lessons` counts only new or changed
rows. It fails, and writes no lesson, if the database holds a lesson that no file has: a shipped
lesson is edited or moved, never deleted. A lesson whose brief or content changed loses its
unfinished attempts, in the same transaction; results stay.

**Who does what, when:**

| When | What | Where |
| --- | --- | --- |
| Authoring | Outlines, briefs and lesson files are written and committed | a member's machine, Claude Code ([content/lessons.md](../content/lessons.md) §7) |
| Build | images.yml builds `api`, `web`, `tooling` and the monitoring images; `tooling` carries `content/` | GitHub Actions, pushed to GHCR |
| Deploy | `migrate`: `prisma migrate deploy`, then `db:seed` | the tooling image, on the server |
| Runtime | The api reads lessons from Postgres and calls the LLM only for restocks, discussions and the key check on the profile page (`POST /api/tutor/check`) | the `api` container, which has no `content/` |

Nothing generates a lesson at build, deploy or seed time.

```bash
docker compose -f compose.deploy.yml ps
curl -sS https://transcendence.dpdns.org/api/health
curl -sS https://transcendence.dpdns.org/grafana/api/health   # 503: this copy runs without monitoring
# The gateway: 101, then curl times out (expected). Without a cookie, since a
# refused session is answered over the socket, not with an HTTP status.
curl -sS -o /dev/null -w '%{http_code}\n' --http1.1 --max-time 3 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  'https://transcendence.dpdns.org/ws/?EIO=4&transport=websocket'
docker compose -f compose.deploy.yml logs caddy    # if the certificate fails
```

### Demo learners

With `DEMO_PASSWORD` set in the server's `.env`, the seed then deletes the six demo learners
(`demo-anna@example.com` to `demo-felix@example.com`) and builds them again, with their
friendships and messages, as `make seed` does in a checkout (`demoSkipReason` in
`apps/api/prisma/seed.ts`). Empty, it logs `demo learners skipped: DEMO_PASSWORD is empty` and
deletes nothing (see the end of this section). Only `migrate` receives the password, never the
api. Paste it like the webhook. A `.env` copied from the old `infra/deploy/.env.example` lacks the
key, and `sed` changes nothing on a missing line, so append it empty first:

```bash
[ -z "$(tail -c1 .env)" ] || echo >> .env
grep -q '^DEMO_PASSWORD=' .env || echo 'DEMO_PASSWORD=' >> .env
read -rs pw && sed -i "s|^DEMO_PASSWORD=.*|DEMO_PASSWORD=$pw|" .env && unset pw
```

It must pass the signup rules (12 to 128 characters, a lowercase letter, an uppercase letter and
a digit), or the seed fails before it writes anything. Keep to letters and digits: compose reads
a `$` as a variable. A learner that fails later (someone took its `demo.<name>`, or the host is
too slow for the replay's transactions) is logged as `demo learner … skipped:`, and the release
goes on. With all six built, the seed logs `seeded 6 of 6 demo learners: …`. Because it runs on
every release:

- their today is the release's: on a day you show them, run the `migrate` command above first
  (`deploy.sh` reruns it only when an image moved), while the deploy timer is idle, so two seeds
  do not race. Seed and show them between 05:00 and 15:00 UTC (from 04:00 in summer): from New York's midnight to Tokyo's, all six time zones are on the same date, so no
  learner's day turns over between the seed and the demo;
- whoever knows the password can sign in as one and change what that learner shows (lessons,
  display name, avatar, 2FA) until the next seed rebuilds them; an avatar uploaded that way
  stays in the avatars volume;
- each seed signs out anyone signed in as one, and removes their friendships and whole
  conversations, a real user's messages to them included;
- an account someone signed up under one of those six addresses is deleted too, and no other:
  `demo-me@example.com` stays. Nothing else of a real user is touched: the lessons are only read.

Emptying `DEMO_PASSWORD` stops the next seeds from building them, but deletes nothing: the
learners an earlier seed built stay, still open with that password. To remove them, and what
cascades from them as a seed removes it:

```bash
docker compose -f compose.deploy.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DELETE FROM "User" WHERE email IN ('demo-anna@example.com', 'demo-ben@example.com',
  'demo-chloe@example.com', 'demo-david@example.com', 'demo-eva@example.com',
  'demo-felix@example.com');
SQL
```

Copying a new `compose.deploy.yml` or editing `.env` deploys nothing
([Automatic deploys](#automatic-deploys)): run the `migrate` command, or wait for the next release.

---

## Redeploying

Same three commands. Migrate before `up -d` so the schema is in place when the new code
starts.

`IMAGE_TAG` defaults to `latest`, which follows `main`. Pin it to a `main-<sha>` tag in `.env`
to hold or roll back a release. With `compose.deploy.monitoring.yml` in place, the oldest tag
that works is the #129 merge, the first to publish the monitoring images. To go further back,
copy that commit's compose file to the server and take the overlay off first
(`git show <sha>:compose.deploy.yml`), or the pull fails on the monitoring images.

### A `.env` from an older template

A server `.env` keeps the order and comments of the template it was copied from, and lacks the
keys added since. `scripts/align-env.sh` rewrites it in the current template's order and comments,
keeps every value, and brings new keys in with the template's default. A key the template no
longer has stays at the end, under `# Not in the template`, and is named on stderr. It prints key
names only, never a value, and refuses a `.env` with a key set twice. The previous file stays as
`.env.bak`, mode 600, secrets included. From the repo (`AntaresVps:ft_transcendence/` on the
primary):

```bash
scp .env.example scripts/align-env.sh ubuntu@140.238.209.2:~/
```

On the server, with a hash of the resolved config before and after, which shows that nothing
changed in effect without printing it (add each overlay the host has after
`-f compose.deploy.yml`, as `deploy.sh` does):

```bash
docker compose -f compose.deploy.yml --profile migrate config --format json | sha256sum
sh align-env.sh .env .env.example
docker compose -f compose.deploy.yml --profile migrate config --format json | sha256sum
```

The same hash means nothing changed and nothing needs a restart: `rm .env.bak align-env.sh`. A
different one means the template brought in a default the old `.env` did not have: read the
masked difference, `diff <(sed 's/=.*/=/' .env.bak) <(sed 's/=.*/=/' .env)`, before deleting
`.env.bak`. Never a plain `diff` of the two files: it prints the secrets.

---

## Automatic deploys

A timer on the box pulls every five minutes and redeploys only when an image moved. Pull-based
rather than GitHub Actions connecting inward, so no deploy credential exists to leak. Both hosts
run it; the commands below are the Oracle copy's, and the primary's are in
[its section](#the-primary-behind-another-reverse-proxy).

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

Every run starts with `docker image prune -f`, which removes only images no container uses. A
failed deploy stops before the end of the script, so a cleanup only after a good deploy is not
enough. In November 2026 the database died on the Oracle host, every deploy failed at the migrate
step, and the release images pulled by each attempt (about 3 GB each) filled the 45 GB disk in
11 days.

`deploy.sh` adds `compose.deploy.monitoring.yml` and `compose.deploy.proxy.yml` to every compose
command when they sit next to it, so the files on the host choose the stack.

Prometheus, Alertmanager and Grafana are images built by images.yml with their config inside, so
a rule or a dashboard merged to `main` deploys like code. A change to `compose.deploy.yml`,
`compose.deploy.monitoring.yml` or `Caddyfile.prod`, exporter pins included, still needs the
`scp` and `up -d` by hand, plus `docker compose -f compose.deploy.yml restart caddy` for the
Caddyfile: Caddy reads it only at start, and `up -d` does not recreate caddy for a changed file.

A host that runs monitoring from a `compose.deploy.yml` older than the overlay needs
`compose.deploy.monitoring.yml` and the new `deploy.sh` in the same `scp` as the new
`compose.deploy.yml`. The new file alone has no monitoring service: the next deploy would leave
the seven containers running on their old images, and nothing would update them again.

---

## Memory

The shape section 2 sets up for the Oracle copy is `VM.Standard.E2.1.Micro`: 1 GB of RAM and a
fraction of a shared core. On the running instance `free -m` shows 954 MiB, `nproc` 2, with a 2 GB swapfile and a 45 GB disk (2026-11-27). The app (Postgres, Redis, Next, Nest, Caddy) takes roughly 450 MB, and monitoring
adds an estimated 330 to 450 MB. Measure before trusting any of it:

```bash
free -m                     # total, available, swap
docker stats --no-stream    # per container, against its limit
uname -m; nproc
```

That is why monitoring is an overlay: a host without the memory for it leaves
`compose.deploy.monitoring.yml` out and runs the app alone
([Monitoring on a server](#monitoring-on-a-server)). The Oracle copy runs that way. The primary
runs monitoring.

Every monitoring service has a hard `mem_limit` in `compose.deploy.monitoring.yml`, 800 MB
together, so a runaway one is OOM-killed and restarted instead of the kernel picking the app.

| Service | `mem_limit` | Idle |
| --- | --- | --- |
| prometheus | 256m | 80 to 150 MB, estimated |
| grafana | 320m | about 180 MB, measured |
| alertmanager | 64m | 15 to 25 MB, estimated |
| node-exporter, postgres-exporter | 48m each | 10 to 20 MB each, estimated |
| redis-exporter, blackbox-exporter | 32m each | 8 to 15 MB each, estimated |

Prometheus and Grafana also get a quarter of the default CPU weight (`cpu_shares: 256`), so
on a shared core they yield to the app. Prometheus keeps at most 15 days or 1 GB on disk.

On a 1 GB box, add a 2 GB swapfile before the first `up`:

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

## Monitoring on a server

Monitoring is the `compose.deploy.monitoring.yml` overlay, so the file being on the host or not
turns it on or off. Without it the host runs the app alone, needs no Grafana key, and
`/grafana` answers 503 with `Monitoring is not running on this host.` With it the seven
services are always on, with no profile.

The primary runs it. The Oracle copy does not: its free-tier VM does not have the memory
([Memory](#memory)).

To turn it on, once, on a host that has the memory for it, such as the copy on a larger shape.
Order matters, because the server's files only change by hand.

**1. Measure.** `free -m`, `uname -m`, `nproc` and `docker stats --no-stream`. If total memory
is about 1 GB, add the swapfile first ([Memory](#memory)).

**2. Add the keys to `.env`.** Before the overlay: it refuses to start without the two Grafana
keys, and that would stop `deploy.sh` too. A `.env` written without monitoring may lack them,
and `sed` changes nothing on a missing line, so append them empty first, after a final newline
if the file lacks one:

```bash
[ -z "$(tail -c1 .env)" ] || echo >> .env
grep -q '^GRAFANA_ADMIN_PASSWORD=' .env || printf '%s=\n' GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY DISCORD_WEBHOOK_URL >> .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Run the two Grafana lines once. A second run writes a password Grafana never applies, and a key
that no longer opens what it encrypted.

**3. Roll out.** From the repo:

```bash
scp compose.deploy.yml compose.deploy.monitoring.yml infra/deploy/deploy.sh ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
```

On the server, run the deploy now instead of waiting for the timer, then restart caddy.
`deploy.sh` counts the overlay's images as a change, so it deploys even when no release moved:

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

**4. Check.** Open `https://<SITE_DOMAIN>/grafana` and log in as `admin`, with the
password from `grep GRAFANA_ADMIN_PASSWORD .env`. Overview should be green. With a webhook set,
send a test alert ([operations/monitoring.md](monitoring.md) section 4, with
`docker compose -f compose.deploy.yml -f compose.deploy.monitoring.yml` in place of
`docker compose`). Then watch `free -m` and `docker stats --no-stream` for a day before trusting
the limits.

**5. Backing out.** If the box swaps hard or OOM-kills the app, take the overlay off. On the
server:

```bash
rm compose.deploy.monitoring.yml
docker compose -f compose.deploy.yml up -d --remove-orphans
```

Add `-f compose.deploy.proxy.yml` after `-f compose.deploy.yml` behind a front proxy. That
removes the seven monitoring containers and keeps their volumes, so putting the file back later
finds the same data, and `/grafana` answers 503. `deploy.sh` keeps deploying the app alone.
`docker compose stop` does not stick: `deploy.sh`'s `up -d` undoes it on the next release.

Without the overlay the api still opens its metrics port on the compose network, and nothing
scrapes it. That is harmless: no port is published.

**Before the overlay.** From #129 (2026-10-18), monitoring sat in `compose.deploy.yml` itself,
always on, and this section was a one-time procedure for the server of the time. The only way to
run without monitoring was the compose file from before #129, which lacks every later change, the
log caps included. That procedure also checked first that the three new GHCR packages were
public, since a new package can start private and a server has no registry login. The primary has
pulled them since, with no login.

---

## The primary, behind another reverse proxy

The primary deployment runs live at **https://trans.vyantares.ch**, on the shared Infomaniak VPS,
where another reverse proxy already owns 80 and 443: `caddy-docker-proxy` serves several projects
there and routes by Docker labels on containers that join its `web` network. The primary also
runs monitoring, so it holds both overlays. The Oracle instance above is the secondary copy. The
same steps fit any host where another proxy owns the HTTPS ports.

`compose.deploy.proxy.yml` makes the difference. Our Caddy publishes no port, joins the front
proxy's network, and carries the two labels that route `SITE_DOMAIN` to it. It serves plain
HTTP on that hop, since the front proxy holds the certificate, and keeps all its own routing
(`/api`, `/grafana`, the metrics site). It also trusts the front proxy's forwarded address, so
the API's rate limits and Grafana's login lockout still see each visitor, not the proxy.

| On the host | From the repo |
| --- | --- |
| `compose.deploy.yml` | `compose.deploy.yml` |
| `compose.deploy.proxy.yml` | `compose.deploy.proxy.yml` |
| `compose.deploy.monitoring.yml` | `compose.deploy.monitoring.yml`, since the primary runs monitoring: leave it out to run the app alone |
| `Caddyfile` | `infra/caddy/Caddyfile.prod` |
| `.env` | `.env.example`, filled in |
| `deploy.sh` | `infra/deploy/deploy.sh`: uses each overlay that is present |

**DNS.** An A record for the name to the host's address. On Cloudflare, make it **DNS only**
(grey cloud): proxied, the front proxy sees Cloudflare's addresses, does not trust them, and
every visitor behind one Cloudflare edge would share a rate limit and a lockout.

**Files**, in their own directory, since the home directory holds other projects:

```bash
ssh AntaresVps mkdir -p ft_transcendence
scp compose.deploy.yml compose.deploy.proxy.yml compose.deploy.monitoring.yml \
  infra/deploy/deploy.sh infra/deploy/ft-deploy.{service,timer} AntaresVps:ft_transcendence/
scp infra/caddy/Caddyfile.prod AntaresVps:ft_transcendence/Caddyfile
scp .env.example AntaresVps:ft_transcendence/.env
```

**`.env`**: as in [Deploying](#5-deploying), with `SITE_DOMAIN` the host's name
(`trans.vyantares.ch` here) and the two Grafana keys, since monitoring runs here. `ACME_EMAIL` is
still required but unused: the front proxy requests the certificate. Set `PROXY_NETWORK` if the
front proxy's network is not called `web`. Uncomment `COMPOSE_PROJECT_NAME=ft_transcendence_prod`,
as on every server. Here it matters most: the shared VPS has a checkout of this repo, and without it
compose would take the checkout's project name, and its volumes with it, database included.

**Deploy** with the script, which adds the overlays itself:

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
# The gateway: 101, then curl times out (expected). Without a cookie, since a
# refused session is answered over the socket, not with an HTTP status.
curl -sS -o /dev/null -w '%{http_code}\n' --http1.1 --max-time 3 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  'https://trans.vyantares.ch/ws/?EIO=4&transport=websocket'
docker logs caddy 2>&1 | grep trans.vyantares.ch    # the front proxy, if the certificate fails
```
