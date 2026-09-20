# Deploying to Oracle Cloud

Live at **https://transcendence.dpdns.org** on `140.238.209.2`.

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
| Shape | `VM.Standard.E2.1.Micro` (always available). `VM.Standard.A1.Flex` at 2 OCPU / 12 GB is better but usually "out of host capacity" |
| Image | Canonical Ubuntu 24.04, architecture matching the shape |
| Subnet | public, **"Assign a public IPv4 address" = Yes** |
| SSH | paste your own public key |
| Ingress | 80/tcp, 443/tcp, 443/udp |

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

Fill in three values; the rest of the template is already correct.

| Key | Value |
| --- | --- |
| `ACME_EMAIL` | a real address |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, **hex not base64**: it goes into `DATABASE_URL` and a `/` breaks the parse |

On the server, so the secrets stay out of your shell history:

```bash
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
```

```bash
docker compose -f compose.deploy.yml --profile migrate pull
docker compose -f compose.deploy.yml --profile migrate run --rm migrate
docker compose -f compose.deploy.yml up -d
```

`--profile migrate` on the pull is required, or the tooling image that runs the migration is
skipped. The migration prints almost nothing on success; `echo $?` is the signal.

```bash
docker compose -f compose.deploy.yml ps
curl -sS https://transcendence.dpdns.org/api/health
docker compose -f compose.deploy.yml logs caddy    # if the certificate fails
```

---

## Redeploying

Same three commands. Migrate before `up -d` so the schema is in place when the new code
starts.

`IMAGE_TAG` defaults to `latest`, which follows `main`. Pin it to a `main-<sha>` tag in `.env`
to hold or roll back a release.

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
