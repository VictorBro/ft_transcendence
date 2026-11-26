# Déployer sur Oracle Cloud

En ligne à **https://transcendence.dpdns.org** sur `140.238.209.2`. Grafana est à
**https://transcendence.dpdns.org/grafana** ([operations/monitoring.md](monitoring.md)).

Trois fichiers vont sur le serveur. Tout le reste vient de `ghcr.io`, qui est public, donc
l'hôte n'a besoin ni de login au registry ni de checkout.

| Sur l'hôte           | Depuis le dépôt                     |
| -------------------- | ----------------------------------- |
| `compose.deploy.yml` | `compose.deploy.yml`                |
| `Caddyfile`          | `infra/caddy/Caddyfile.prod`        |
| `.env`               | `infra/deploy/.env.example`, rempli |

---

## 1. Le CLI OCI dans le devcontainer

Une reconstruction du devcontainer efface tout ça, donc attends-toi à le refaire.

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

Affiche une URL à ouvrir sur ta propre machine. Chaque commande suivante a besoin de `--auth security_token`.
Le token dure environ une heure ; `oci session refresh --profile DEFAULT` le prolonge.

---

## 2. Créer l'instance

```bash
oci compute instance list --auth security_token --output table \
  --compartment-id "$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)" \
  --query 'data[?"lifecycle-state"!=`TERMINATED`].{name:"display-name",state:"lifecycle-state"}'
```

| Réglage | Valeur                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shape   | `VM.Standard.E2.1.Micro` (toujours disponible, 1 GB : voir [Mémoire](#mémoire) ; le shape du serveur en ligne n'est pas encore mesuré). `VM.Standard.A1.Flex` avec 2 OCPU / 12 GB est mieux, mais répond en général "out of host capacity" (plus de capacité) |
| Image   | Canonical Ubuntu 24.04, avec l'architecture qui correspond au shape                                                                                                                                    |
| Subnet  | public, **"Assign a public IPv4 address" = Yes**                                                                                                                                                       |
| SSH     | colle ta propre clé publique                                                                                                                                                                           |
| Ingress | 22/tcp (SSH, pour les `ssh` et `scp` plus bas), 80/tcp, 443/tcp, 443/udp. Rien d'autre : on atteint Grafana à travers Caddy sur 443, donc n'ouvre jamais 3000, 9090 ou 9093                                                                            |

Cloud-init, pour installer Docker au démarrage. `#cloud-config` doit être la première ligne, sinon le fichier est
ignoré sans message. Mets `arch=` à `amd64` ou `arm64` selon le shape :

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

Ne touche pas aux iptables de l'instance. Docker publie les ports par `FORWARD`, pas par `INPUT`,
donc la security list suffit, et un `iptables -F` avec la stack lancée casse le réseau des
containers.

---

## 3. L'IP change après un redémarrage

OCI attribue une IP **éphémère**, qui est libérée quand l'instance s'arrête.

```bash
oci network public-ip list --auth security_token --output table \
  --compartment-id "$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)" \
  --scope AVAILABILITY_DOMAIN --availability-domain "creI:EU-ZURICH-1-AD-1" \
  --query 'data[].{ip:"ip-address",lifetime:lifetime}'
```

OCI ne peut pas la convertir sur place. Soit tu en réserves une (**Instance → Attached VNICs → la VNIC →
IPv4 Addresses → edit → Reserved**, ce qui donne une adresse _différente_), soit tu la laisses et tu corriges
l'enregistrement A si elle change un jour.

---

## 4. DNS

| Champ | Valeur        |
| ----- | ------------- |
| Type  | `A`           |
| Name  | `@`           |
| Value | l'IP publique |
| TTL   | `300`         |

Rien d'autre : pas de AAAA, pas de `www`, pas de MX. Attends que le nom se résolve avant de lancer la stack, sinon
Caddy gaspille une tentative Let's Encrypt, qui sont limitées.

```bash
dig +short A transcendence.dpdns.org
```

---

## 5. Déployer

```bash
ssh -i ~/.ssh/id_ed25519_vic ubuntu@140.238.209.2
```

```bash
scp compose.deploy.yml ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
scp infra/deploy/.env.example ubuntu@140.238.209.2:~/.env
```

Remplis cinq valeurs, choisis le fournisseur de LLM, et ajoute le webhook Discord si les alertes doivent arriver dans un
channel ; le reste du modèle est déjà correct.

| Clé                      | Valeur                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACME_EMAIL`             | une vraie adresse                                                                                                                                                                |
| `SESSION_SECRET`         | `openssl rand -hex 32`                                                                                                                                                           |
| `POSTGRES_PASSWORD`      | `openssl rand -hex 32`, **en hex, pas en base64** : il va dans `DATABASE_URL` et un `/` casse la lecture de l'URL                                                                |
| `GRAFANA_ADMIN_PASSWORD` | `openssl rand -hex 24`. Appliqué seulement quand le volume `grafana-data` est créé ; le changer plus tard demande un reset ([operations/monitoring.md](monitoring.md) section 2) |
| `GRAFANA_SECRET_KEY`     | `openssl rand -hex 32`. À définir une seule fois : la changer casse ce que Grafana a chiffré                                                                                     |
| `DISCORD_WEBHOOK_URL`    | optionnel. Vide : les alertes sont visibles seulement dans Grafana                                                                                                               |
| `LLM_PROVIDER`           | **obligatoire** : `fixture`, `gemini` ou `disabled` (plus bas). `compose.deploy.yml` refuse de démarrer sans lui                                                                 |
| `LLM_API_KEY`            | avec `gemini` seulement. Collée comme le webhook, avec `read -rs`                                                                                                                |

### Le fournisseur de LLM et ses limites

Tout est lu par l'api au démarrage. Un mauvais fournisseur, une clé Gemini manquante ou une limite qui n'est pas un nombre
entier l'arrête, donc la faute de frappe se voit au deploy, pas à la première leçon. `LLM_MODEL` n'est pas
vérifié : un mauvais id de modèle se voit comme un `http_error` au premier appel. `compose.yml` et `compose.deploy.yml` passent les mêmes noms.

| Variable                           | Défaut                                                                                         | Signification                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`                     | `fixture` en local ; sur un serveur, aucun dans `compose.deploy.yml`, `fixture` dans le modèle | `gemini` : la banque de placement réapprovisionne une case qui se vide, et la discussion de leçon répond. `fixture` : pas de réseau, aucune question écrite, le tuteur donne une seule réponse toute faite ; c'est ce que lance la CI. `disabled` : pas de LLM du tout, chaque message de discussion se termine par `llm.disabled` |
| `LLM_API_KEY`                      | vide                                                                                           | La clé Gemini, envoyée dans le header `x-goog-api-key`. Obligatoire avec `gemini`                                                                                                                                                                                                                                                  |
| `LLM_MODEL`                        | vide = `gemini-3.6-flash`                                                                      | L'id du modèle Gemini. Ignoré par les autres fournisseurs                                                                                                                                                                                                                                                                          |
| `LLM_DISCUSSION_USER_PER_MINUTE`   | 2                                                                                              | Messages de discussion par apprenant et par minute                                                                                                                                                                                                                                                                                 |
| `LLM_DISCUSSION_USER_PER_DAY`      | 60                                                                                             | Par apprenant et par jour. La fenêtre commence au premier message de l'apprenant, pas à minuit                                                                                                                                                                                                                                     |
| `LLM_DISCUSSION_GLOBAL_PER_MINUTE` | 5                                                                                              | Pour tout le monde ensemble : garde-la sous le quota par minute de la clé, que partagent les réapprovisionnements de la banque. 5 convient à une clé gratuite                                                                                                                                                                      |
| `RATE_LIMIT_PER_MINUTE`            | 100                                                                                            | Chaque route HTTP, par compte, ou par adresse quand on n'est pas connecté                                                                                                                                                                                                                                                          |
| `SIGNUP_LIMIT_PER_MINUTE`          | 20                                                                                             | Inscriptions par adresse                                                                                                                                                                                                                                                                                                           |
| `LOGIN_LIMIT_PER_MINUTE`           | 5                                                                                              | Vérifications de mot de passe et de code 2FA par adresse                                                                                                                                                                                                                                                                           |

Vide veut dire la valeur par défaut. Les trois limites de discussion sont comptées dans Redis avant tout appel au LLM ;
au-delà d'une limite, l'api répond 429 avec `Retry-After` et `retryAfter` dans le body, et
`ft_llm_discussion_limited_total{limit}` le compte ([operations/monitoring.md](monitoring.md) §5).

`LESSON_STUB` n'existe plus. Elle ouvrait une route `PUT …/result` qui prenait un score tapé à la main, pour le dev
et la CI avant que la page de leçon existe ; la route et la variable ont été retirées avec les
tentatives notées par le serveur (#145). Un `.env` de serveur qui
a encore la ligne ne pose pas de problème : rien ne la lit. Supprime-la.

Sur le serveur, pour que les secrets restent hors de l'historique de ton shell :

```bash
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
```

Le webhook est collé, pas généré, donc une valeur écrite en dur dans une ligne `sed` finirait dans
`~/.bash_history`. Lis-le plutôt sans affichage : colle, puis Entrée. Une URL de webhook Discord
contient des `/` mais jamais de `|`.

```bash
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Avec Gemini, définis le fournisseur et colle la clé de la même façon :

```bash
sed -i "s|^LLM_PROVIDER=.*|LLM_PROVIDER=gemini|" .env
read -rs key && sed -i "s|^LLM_API_KEY=.*|LLM_API_KEY=$key|" .env && unset key
```

Sur un shape de 1 GB, ajoute du swap avant le premier `up` ([Mémoire](#mémoire)).

```bash
docker compose -f compose.deploy.yml --profile migrate pull
docker compose -f compose.deploy.yml --profile migrate run --rm migrate
docker compose -f compose.deploy.yml up -d
```

`--profile migrate` sur le pull est obligatoire, sinon l'image d'outillage qui lance la migration est
sautée. `migrate` applique les migrations, puis lance `db:seed` : la banque de questions et les
leçons sont livrées comme fichiers dans `content/`, à l'intérieur de l'image d'outillage, donc une base de données neuve en a besoin
avant que l'app soit utilisable.

**Ce que charge le seed**, tout depuis des fichiers commités dans le dépôt et écrits hors ligne :

| Depuis                                | Vers                                                                       | Lignes                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `content/items/*.json`                | `QuestionBank`, retrouvées par `sourceId`                                  | les questions écrites                                                    |
| `content/outlines/*.json`             | `Lesson`, une ligne par entrée                                             | 3 990, chaque entrée, écrite ou non                                      |
| `content/briefs/`, `content/lessons/` | `Lesson.brief`, `Lesson.content`, le titre et le résumé, et `ready = true` | 216 leçons prêtes, les 12 premières de chaque langue et de chaque niveau |

`ready` est recalculé à chaque lancement à partir des fichiers seulement : une leçon dont les fichiers existent et passent
`validateLesson` est prête, toutes les autres lignes ne le sont pas, et seules les leçons prêtes peuvent être proposées ou
jouées. Un fichier de leçon invalide arrête la moitié « leçons » du seed avant qu'elle écrive la moindre leçon,
en donnant l'id ; les questions, seedées en premier, sont déjà écrites. Les apprenants de démo ne sont jamais seedés
ici : ils ont besoin de `NODE_ENV=development` et d'un `DEMO_PASSWORD` non vide (`demoSkipReason` dans
`apps/api/prisma/seed.ts`), et le service `migrate` ne définit ni l'un ni l'autre.

Les deux moitiés font un upsert sur les ids écrits, donc le seed est sans risque à chaque redeploy. En cas de succès, il se termine
par `seeded N questions` et `seeded N lessons`, où `N lessons` compte seulement les lignes nouvelles ou modifiées.
Il échoue, et n'écrit aucune leçon, si la base contient une leçon qu'aucun fichier n'a : une leçon
livrée se modifie ou se déplace, mais ne se supprime jamais. Une leçon dont le brief ou le contenu a changé perd ses
tentatives non terminées, dans la même transaction ; les résultats restent.

**Qui fait quoi, et quand :**

| Quand    | Quoi                                                                                                            | Où                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Écriture | Les plans, les briefs et les fichiers de leçon sont écrits et commités                                          | la machine d'un membre, Claude Code ([content/lessons.md](../content/lessons.md) §7) |
| Build    | images.yml construit `api`, `web`, `tooling` et les images de monitoring ; `tooling` contient `content/`        | GitHub Actions, poussé vers GHCR                                                     |
| Deploy   | `migrate` : `prisma migrate deploy`, puis `db:seed`                                                             | l'image d'outillage, sur le serveur                                                  |
| Runtime  | L'api lit les leçons dans Postgres et appelle le LLM seulement pour les réapprovisionnements et les discussions | le container `api`, qui n'a pas de `content/`                                        |

Rien ne génère de leçon au moment du build, du deploy ou du seed.

```bash
docker compose -f compose.deploy.yml ps
curl -sS https://transcendence.dpdns.org/api/health
curl -sS https://transcendence.dpdns.org/grafana/api/health
# The gateway: 101, then curl times out (expected). Without a cookie, since a
# refused session is answered over the socket, not with an HTTP status.
curl -sS -o /dev/null -w '%{http_code}\n' --http1.1 --max-time 3 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  'https://transcendence.dpdns.org/ws/?EIO=4&transport=websocket'
docker compose -f compose.deploy.yml logs caddy    # if the certificate fails
```

---

## Redéployer

Les trois mêmes commandes. Lance la migration avant `up -d`, pour que le schema soit en place quand le nouveau code
démarre.

`IMAGE_TAG` vaut `latest` par défaut, qui suit `main`. Fixe-le sur un tag `main-<sha>` dans `.env`
pour garder une release ou revenir en arrière. Avec ce fichier compose, le plus ancien tag qui marche est le merge de
#129. Pour remonter plus loin, copie d'abord le fichier compose de ce commit sur le serveur
(`git show <sha>:compose.deploy.yml`), sinon le pull échoue sur les images de monitoring.

---

## Les deploys automatiques

Un timer sur la machine fait un pull toutes les cinq minutes et redéploie seulement quand une image a changé. On tire
depuis le serveur plutôt que de laisser GitHub Actions s'y connecter, donc il n'existe aucun identifiant de deploy qui pourrait fuiter.

```bash
scp infra/deploy/deploy.sh ubuntu@140.238.209.2:~/
scp infra/deploy/ft-deploy.{service,timer} ubuntu@140.238.209.2:~/
```

Sur le serveur :

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

La plupart des lancements affichent `no change` et s'arrêtent avant de démarrer quoi que ce soit. Pour geler les deploys, fixe
`IMAGE_TAG` sur un `main-<sha>` dans `.env` ; le timer continue de tourner et continue de ne rien trouver.

Prometheus, Alertmanager et Grafana sont des images construites par images.yml avec leur config dedans, donc
une règle ou un dashboard mergé dans `main` se déploie comme du code. Un changement de `compose.deploy.yml` ou de
`Caddyfile.prod`, versions des exporters comprises, demande toujours le `scp` et le `up -d` à la main, plus
`docker compose -f compose.deploy.yml restart caddy` pour le Caddyfile : Caddy le lit seulement au
démarrage, et `up -d` ne recrée pas caddy pour un fichier modifié.

---

## Mémoire

Le shape que la section 2 met en place est `VM.Standard.E2.1.Micro` : 1 GB de RAM et une fraction d'un
cœur partagé. Le shape et la RAM du serveur en ligne ne sont pas encore mesurés. L'app (Postgres, Redis, Next, Nest, Caddy) prend environ 450 MB, et le monitoring
ajoute environ 330 à 450 MB d'après une estimation. Mesure avant de te fier à ces chiffres :

```bash
free -m                     # total, available, swap
docker stats --no-stream    # per container, against its limit
uname -m; nproc
```

Chaque service de monitoring a un `mem_limit` strict, 800 MB en tout, pour qu'un service qui s'emballe soit
tué (OOM-killed) et redémarré, au lieu que le noyau choisisse l'app.

| Service                           | `mem_limit` | Au repos                  |
| --------------------------------- | ----------- | ------------------------- |
| prometheus                        | 256m        | 80 à 150 MB, estimé       |
| grafana                           | 320m        | environ 180 MB, mesuré    |
| alertmanager                      | 64m         | 15 à 25 MB, estimé        |
| node-exporter, postgres-exporter  | 48m chacun  | 10 à 20 MB chacun, estimé |
| redis-exporter, blackbox-exporter | 32m chacun  | 8 à 15 MB chacun, estimé  |

Prometheus et Grafana reçoivent aussi un quart du poids CPU par défaut (`cpu_shares: 256`), donc
sur un cœur partagé ils laissent passer l'app. Prometheus garde au plus 15 jours ou 1 GB sur le disque.

Sur une machine de 1 GB, ajoute un fichier de swap de 2 GB avant que le monitoring démarre :

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```

La ligne dans `/etc/fstab` le garde après un redémarrage. L'alerte `HostMemoryLow` compte le swap, donc une machine
qui reste près de 90 % de RAM avec du swap disponible ne poste pas sur Discord toutes les heures.

---

## Activer le monitoring sur le serveur en marche

Une seule fois, pour le serveur qui existait avant le monitoring. L'ordre compte, parce que le
`compose.deploy.yml` du serveur ne change qu'à la main.

**1. Attends les images.** Après le merge, images.yml sur `main` publie `prometheus`,
`alertmanager` et `grafana` avec le tag `latest`. Un nouveau paquet GHCR peut démarrer en privé, et
le serveur n'a pas de login au registry, donc vérifie depuis le serveur que les trois sont publics, comme
`api`, `web` et `tooling`. Sinon `deploy.sh` reste bloqué sur le pull.

```bash
for i in prometheus alertmanager grafana; do
  docker buildx imagetools inspect "ghcr.io/victorbro/ft_transcendence/$i:latest" >/dev/null && echo "$i ok"
done
```

**2. Mesure.** `free -m`, `uname -m`, `nproc` et `docker stats --no-stream`. Si la mémoire totale
est d'environ 1 GB, ajoute d'abord le fichier de swap ([Mémoire](#mémoire)).

**3. Ajoute les clés dans `.env`.** Avant le nouveau fichier compose : il refuse de démarrer sans les deux
clés de Grafana, et ça arrêterait aussi `deploy.sh`. Le `.env` du serveur est plus ancien qu'elles, et
`sed` ne change rien sur une ligne absente, donc ajoute-les d'abord vides à la fin, après un retour à la ligne final si
le fichier n'en a pas :

```bash
[ -z "$(tail -c1 .env)" ] || echo >> .env
grep -q '^GRAFANA_ADMIN_PASSWORD=' .env || printf '%s=\n' GRAFANA_ADMIN_PASSWORD GRAFANA_SECRET_KEY DISCORD_WEBHOOK_URL >> .env
sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^GRAFANA_SECRET_KEY=.*|GRAFANA_SECRET_KEY=$(openssl rand -hex 32)|" .env
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Lance les deux lignes Grafana une seule fois. Un deuxième lancement écrit un mot de passe que Grafana n'applique jamais, et une clé
qui n'ouvre plus ce qu'elle a chiffré.

**4. Déploie.** Depuis le dépôt :

```bash
scp compose.deploy.yml ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
```

Sur le serveur, lance le deploy maintenant au lieu d'attendre le timer, puis redémarre caddy :

```bash
sudo systemctl start ft-deploy.service
journalctl -u ft-deploy.service -n 50
docker compose -f compose.deploy.yml restart caddy
```

Pas les trois commandes compose à la main : le timer voit les nouvelles images en moins de cinq minutes et
les lance aussi, et deux `up -d` en même temps peuvent échouer sur les noms des containers. `start` attend la fin du
deploy, et rejoint un lancement que le timer a déjà commencé au lieu d'en démarrer un deuxième. Le log
doit afficher `deploying <sha>`, ou `no change` quand un tick est passé avant. Si tu vois
`release still publishing`, attends et relance.

Le redémarrage charge le nouveau Caddyfile, avec `/grafana` et le site des métriques : `up -d` laisse
caddy tourner avec l'ancien.

**5. Vérifie.** Ouvre https://transcendence.dpdns.org/grafana et connecte-toi en `admin`, avec le
mot de passe donné par `grep GRAFANA_ADMIN_PASSWORD .env`. Overview doit être vert. Si un webhook est défini,
envoie une alerte de test ([operations/monitoring.md](monitoring.md) section 4, avec
`docker compose -f compose.deploy.yml` à la place de `docker compose`). Puis surveille `free -m` et
`docker stats --no-stream` pendant une journée avant de te fier aux limites.

**6. Revenir en arrière.** Si la machine swappe beaucoup ou que l'app est tuée par l'OOM killer, remets le fichier compose d'avant
le monitoring. Depuis le dépôt :

```bash
git show <merge-sha>~1:compose.deploy.yml > /tmp/compose.deploy.yml
scp /tmp/compose.deploy.yml ubuntu@140.238.209.2:~/compose.deploy.yml
```

Sur le serveur :

```bash
docker compose -f compose.deploy.yml up -d --remove-orphans
```

Ça supprime les sept containers de monitoring et garde leurs volumes et le nouveau Caddyfile, donc
`/grafana` répond 502. Les solutions évidentes ne tiennent pas : `docker compose stop` est annulé par le
`up -d` de `deploy.sh` à la release suivante, et fixer `IMAGE_TAG` sur un `main-<sha>` d'avant le
monitoring fait échouer le pull tant que le nouveau fichier compose est en place.

Jusqu'à l'étape 4, et après l'étape 6, le serveur fait tourner l'ancien fichier compose avec la nouvelle image api. Ce
n'est pas un problème : le port des métriques de l'api écoute sur le réseau et rien ne le scrape.

---

## Derrière un autre reverse proxy

Pour un hôte où un autre reverse proxy possède déjà 80 et 443, comme le VPS Infomaniak partagé :
là-bas, `caddy-docker-proxy` sert plusieurs projets et route selon les labels Docker des containers
qui rejoignent son réseau `web`. Notre stack tourne en ligne à **https://trans.vyantares.ch** de cette façon,
à côté du déploiement Oracle ci-dessus.

`compose.deploy.proxy.yml` fait la différence. Notre Caddy ne publie aucun port, rejoint le réseau du proxy
de devant, et porte les deux labels qui routent `SITE_DOMAIN` vers lui. Il sert du HTTP simple
sur ce saut, puisque le proxy de devant a le certificat, et garde tout son propre routage
(`/api`, `/grafana`, le site des métriques). Il fait aussi confiance à l'adresse transmise par le proxy de devant, pour que
les rate limits de l'API et le verrouillage du login de Grafana voient toujours chaque visiteur, et pas le proxy.

| Sur l'hôte                 | Depuis le dépôt                                                   |
| -------------------------- | ----------------------------------------------------------------- |
| `compose.deploy.yml`       | `compose.deploy.yml`                                              |
| `compose.deploy.proxy.yml` | `compose.deploy.proxy.yml`                                        |
| `Caddyfile`                | `infra/caddy/Caddyfile.prod`                                      |
| `.env`                     | `infra/deploy/.env.example`, rempli                               |
| `deploy.sh`                | `infra/deploy/deploy.sh` : utilise l'overlay quand il est présent |

**DNS.** Un enregistrement A du nom vers l'adresse de l'hôte. Sur Cloudflare, mets-le en **DNS only**
(nuage gris) : en mode proxied, le proxy de devant voit les adresses de Cloudflare, ne leur fait pas confiance, et
tous les visiteurs derrière un même point Cloudflare partageraient une rate limit et un verrouillage.

**Fichiers**, dans leur propre dossier, puisque le dossier personnel contient d'autres projets :

```bash
ssh AntaresVps mkdir -p ft_transcendence
scp compose.deploy.yml compose.deploy.proxy.yml infra/deploy/deploy.sh \
  infra/deploy/ft-deploy.{service,timer} AntaresVps:ft_transcendence/
scp infra/caddy/Caddyfile.prod AntaresVps:ft_transcendence/Caddyfile
scp infra/deploy/.env.example AntaresVps:ft_transcendence/.env
```

**`.env`** : comme dans [Déployer](#5-déployer), avec `SITE_DOMAIN` égal au nouveau nom. `ACME_EMAIL` est
toujours obligatoire mais pas utilisé : c'est le proxy de devant qui demande le certificat. Définis `PROXY_NETWORK` si le
réseau du proxy de devant ne s'appelle pas `web`. Sur un hôte où quelqu'un a fait un checkout de ce
dépôt, définis `COMPOSE_PROJECT_NAME=ft_transcendence_prod` : sinon compose prendrait le nom de projet du
checkout, et ses volumes avec, base de données comprise. Le VPS partagé en a un.

**Déploie** avec le script, qui ajoute l'overlay tout seul :

```bash
cd ~/ft_transcendence && chmod +x deploy.sh && ./deploy.sh
```

**Deploys automatiques** : les units contiennent l'utilisateur et les chemins d'Oracle, donc réécris-les avant
de les installer :

```bash
cd ~/ft_transcendence
sed -i "s|^User=.*|User=$USER|; s|/home/ubuntu|$HOME/ft_transcendence|g" ft-deploy.service
sudo mv ft-deploy.service ft-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ft-deploy.timer
```

**Vérifie** : le proxy de devant lit les labels tout seul et demande le certificat moins d'une
minute après la première requête.

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
