# Déployer

Deux hôtes font tourner l'app, et les deux suivent `main` tout seuls ([Les deploys automatiques](#les-deploys-automatiques)).

| Hôte                                                      | Où                                                                                                                                                                                 | Monitoring                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **https://trans.vyantares.ch**, le déploiement principal  | Un VPS Infomaniak partagé, derrière son `caddy-docker-proxy`, qui a le certificat ([Le principal, derrière un autre reverse proxy](#le-principal-derrière-un-autre-reverse-proxy)) | Allumé. Grafana est à **https://trans.vyantares.ch/grafana** ([operations/monitoring.md](monitoring.md))                                             |
| **https://transcendence.dpdns.org**, une copie secondaire | L'instance Oracle Cloud sur `140.238.209.2` que mettent en place les sections 1 à 5. Notre propre Caddy obtient son certificat                                                     | Éteint : la VM gratuite n'a pas assez de mémoire ([Mémoire](#mémoire)). Elle tourne sans `compose.deploy.monitoring.yml`, donc `/grafana` répond 503 |

Les sections 1 à 5 construisent la copie Oracle à partir de rien. Le principal prend les mêmes fichiers et le
même `.env`, à part `SITE_DOMAIN`, plus les overlays de monitoring et de proxy.

Trois fichiers vont sur le serveur, et un quatrième là où le monitoring tourne. Tout le reste vient de
`ghcr.io`, qui est public, donc l'hôte n'a besoin ni de login au registry ni de checkout.

| Sur l'hôte                      | Depuis le dépôt                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.deploy.yml`            | `compose.deploy.yml`                                                                                                                  |
| `Caddyfile`                     | `infra/caddy/Caddyfile.prod`                                                                                                          |
| `.env`                          | `.env.example`, rempli                                                                                                                |
| `compose.deploy.monitoring.yml` | `compose.deploy.monitoring.yml`, seulement là où le monitoring tourne ([Le monitoring sur un serveur](#le-monitoring-sur-un-serveur)) |

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

| Réglage | Valeur                                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape   | `VM.Standard.E2.1.Micro` (toujours disponible, 1 GB : voir [Mémoire](#mémoire) ; le serveur en ligne a 954 MiB utilisables et 2 vCPU, mesurés le 2026-11-27). `VM.Standard.A1.Flex` avec 2 OCPU / 12 GB est mieux, mais répond en général "out of host capacity" (plus de capacité) |
| Image   | Canonical Ubuntu 24.04, avec l'architecture qui correspond au shape                                                                                                                                                                                                                 |
| Subnet  | public, **"Assign a public IPv4 address" = Yes**                                                                                                                                                                                                                                    |
| SSH     | colle ta propre clé publique                                                                                                                                                                                                                                                        |
| Ingress | 22/tcp (SSH, pour les `ssh` et `scp` plus bas), 80/tcp, 443/tcp, 443/udp. Rien d'autre : n'ouvre jamais 3000, 9090 ou 9093 (là où le monitoring tourne, on atteint Grafana à travers Caddy sur 443)                                                                                 |

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
scp .env.example ubuntu@140.238.209.2:~/.env
```

`.env.example` est le seul modèle, pour un checkout comme pour un serveur. Il a trois sections, et un serveur lit
les deux premières : la section 3, "checkout only", n'y sert à rien, donc la modifier ne change rien. Chaque clé
obligatoire est vide dans le modèle, et compose refuse de démarrer tant qu'elle n'est pas définie, donc un modèle
copié ne tourne jamais avec une valeur publiée dans ce dépôt.

Obligatoires, les clés Grafana seulement là où le monitoring tourne :

| Clé                      | Valeur                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_DOMAIN`            | le nom public, ici `transcendence.dpdns.org`                                                                                                                                                                   |
| `ACME_EMAIL`             | une vraie adresse                                                                                                                                                                                              |
| `SESSION_SECRET`         | `openssl rand -hex 32`                                                                                                                                                                                         |
| `POSTGRES_PASSWORD`      | `openssl rand -hex 32`, **en hex, pas en base64** : il va dans `DATABASE_URL` et un `/` casse la lecture de l'URL                                                                                              |
| `LLM_PROVIDER`           | `fixture`, `gemini` ou `disabled` (plus bas). Vide dans le modèle, et `compose.deploy.yml` refuse de démarrer sans lui                                                                                         |
| `GRAFANA_ADMIN_PASSWORD` | avec le monitoring seulement. `openssl rand -hex 24`. Appliqué seulement quand le volume `grafana-data` est créé ; le changer plus tard demande un reset ([operations/monitoring.md](monitoring.md) section 2) |
| `GRAFANA_SECRET_KEY`     | avec le monitoring seulement. `openssl rand -hex 32`. À définir une seule fois : la changer casse ce que Grafana a chiffré                                                                                     |

Optionnelles :

| Clé                   | Valeur                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY`         | avec `gemini` seulement. Collée comme le webhook, avec `read -rs`                                                                                                                                                                              |
| `DISCORD_WEBHOOK_URL` | avec le monitoring seulement. Vide : les alertes sont visibles seulement dans Grafana. Chaque titre Discord commence par `SITE_DOMAIN`, donc l'équipe distingue les hôtes et les laptops ([operations/monitoring.md](monitoring.md) section 4) |
| `IMAGE_TAG`           | `latest` dans le modèle ([Redéployer](#redéployer))                                                                                                                                                                                            |
| `PROXY_NETWORK`       | derrière un autre reverse proxy seulement ([Le principal, derrière un autre reverse proxy](#le-principal-derrière-un-autre-reverse-proxy))                                                                                                     |
| `DEMO_PASSWORD`       | les six apprenants de démo, reconstruits par le seed de chaque release ([Apprenants de démo](#apprenants-de-démo)). Collé comme le webhook, avec `read -rs`                                                                                    |

Et sur chaque serveur, décommente `COMPOSE_PROJECT_NAME=ft_transcendence_prod`. Les deux nôtres tournent sous
`ft_transcendence_prod`, donc leurs fichiers `.env` sont le même fichier, à part `SITE_DOMAIN`. Sur un hôte qui a
aussi un checkout de ce dépôt, il sépare les deux stacks : le checkout tourne sous `ft_transcendence`, et le même
nom partagerait ses volumes, base de données comprise. Ne le définis jamais dans un checkout : le Makefile suppose
`ft_transcendence`. Compose met ce nom devant chaque volume, donc la base de données est dans
`ft_transcendence_prod_pg-data`.

La copie Oracle a tourné sous `ft_transcendence` jusqu'au 2026-11-27. Un nouveau nom veut dire de nouveaux volumes,
vides : ses anciens ont été supprimés et la base de données seedée à nouveau à partir de zéro. Le volume de Caddy
a d'abord été copié dans `ft_transcendence_prod_caddy-data`, donc Caddy a gardé son certificat et n'en a demandé
aucun à Let's Encrypt.

`deploy.sh` refuse aussi un `.env` dont `SESSION_SECRET`, `POSTGRES_PASSWORD` ou les clés Grafana ont une valeur
que ce dépôt publie pour les stacks locales et la CI (`ft_local_dev`, `dev-only-…`, `ci-only-…`) : `:?` dans
compose n'arrête qu'une valeur vide. Il donne le nom de la clé, jamais la valeur. Les trois commandes plus bas
sautent cette vérification ; `deploy.sh` la fait à chaque passage du timer.

### Le fournisseur de LLM et ses limites

Tout est lu par l'api au démarrage. Un mauvais fournisseur, une clé Gemini manquante ou une limite qui n'est pas un nombre
entier l'arrête, donc la faute de frappe se voit au deploy, pas à la première leçon. `LLM_MODEL` n'est pas
vérifié : un mauvais id de modèle se voit comme un `http_error` au premier appel. `compose.yml` et `compose.deploy.yml` passent les mêmes noms.

| Variable                           | Défaut                                                                               | Signification                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`                     | `fixture` en local, par `compose.yml` ; sur un serveur aucun, et vide dans le modèle | `gemini` : la banque de placement réapprovisionne une case qui se vide, et la discussion de leçon répond. `fixture` : pas de réseau, aucune question écrite, le tuteur donne une seule réponse toute faite ; c'est ce que lance la CI. `disabled` : pas de LLM du tout, chaque message de discussion se termine par `llm.disabled` |
| `LLM_API_KEY`                      | vide                                                                                 | La clé Gemini, envoyée dans le header `x-goog-api-key`. Obligatoire avec `gemini`                                                                                                                                                                                                                                                  |
| `LLM_MODEL`                        | vide = `gemini-3.6-flash`                                                            | L'id du modèle Gemini. Ignoré par les autres fournisseurs                                                                                                                                                                                                                                                                          |
| `LLM_DISCUSSION_USER_PER_MINUTE`   | 5                                                                                    | Messages de discussion par apprenant et par minute                                                                                                                                                                                                                                                                                 |
| `LLM_DISCUSSION_USER_PER_DAY`      | 150                                                                                  | Par apprenant et par jour. La fenêtre commence au premier message de l'apprenant, pas à minuit                                                                                                                                                                                                                                     |
| `LLM_DISCUSSION_GLOBAL_PER_MINUTE` | 10                                                                                   | Pour tout le monde ensemble : garde-la sous le quota par minute de la clé (Google AI Studio l'affiche), que partagent les réapprovisionnements de la banque. Si ce quota est d'environ 5, mets 5 ici et 3 par apprenant                                                                                                            |
| `RATE_LIMIT_PER_MINUTE`            | 100                                                                                  | Chaque route HTTP, par compte, ou par adresse quand on n'est pas connecté                                                                                                                                                                                                                                                          |
| `SIGNUP_LIMIT_PER_MINUTE`          | 20                                                                                   | Inscriptions par adresse                                                                                                                                                                                                                                                                                                           |
| `LOGIN_LIMIT_PER_MINUTE`           | 20                                                                                   | Vérifications de mot de passe et de code 2FA par adresse                                                                                                                                                                                                                                                                           |

Vide veut dire la valeur par défaut. Les trois limites de discussion sont comptées dans Redis avant tout appel au LLM ;
au-delà d'une limite, l'api répond 429 avec `Retry-After` et `retryAfter` dans le body, et
`ft_llm_discussion_limited_total{limit}` le compte ([operations/monitoring.md](monitoring.md) §5).

Sur le serveur, pour que les secrets restent hors de l'historique de ton shell. Les commandes `openssl` sont celles
que donnent les commentaires du modèle :

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

Le webhook est collé, pas généré, donc une valeur écrite en dur dans une ligne `sed` finirait dans
`~/.bash_history`. Lis-le plutôt sans affichage : colle, puis Entrée. Une URL de webhook Discord
contient des `/` mais jamais de `|`.

```bash
read -rs url && sed -i "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$url|" .env && unset url
```

Ensuite le fournisseur. `fixture` ou `disabled`, c'est une ligne :

```bash
sed -i "s|^LLM_PROVIDER=.*|LLM_PROVIDER=fixture|" .env
```

Avec Gemini, définis le fournisseur et colle la clé de la même façon que le webhook :

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

Là où le monitoring tourne, chaque commande prend aussi `-f compose.deploy.monitoring.yml` après
`-f compose.deploy.yml`, comme le fait `deploy.sh` ([Le monitoring sur un serveur](#le-monitoring-sur-un-serveur)).

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
en donnant l'id ; les questions, seedées en premier, sont déjà écrites. Viennent ensuite les apprenants de démo,
quand le `.env` du serveur définit `DEMO_PASSWORD` ([Apprenants de démo](#apprenants-de-démo)).

Les deux moitiés font un upsert sur les ids écrits, donc le seed est sans risque à chaque redeploy. En cas de succès, il se termine
par `seeded N questions` et `seeded N lessons`, où `N lessons` compte seulement les lignes nouvelles ou modifiées.
Il échoue, et n'écrit aucune leçon, si la base contient une leçon qu'aucun fichier n'a : une leçon
livrée se modifie ou se déplace, mais ne se supprime jamais. Une leçon dont le brief ou le contenu a changé perd ses
tentatives non terminées, dans la même transaction ; les résultats restent.

**Qui fait quoi, et quand :**

| Quand    | Quoi                                                                                                                                                                              | Où                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Écriture | Les plans, les briefs et les fichiers de leçon sont écrits et commités                                                                                                            | la machine d'un membre, Claude Code ([content/lessons.md](../content/lessons.md) §7) |
| Build    | images.yml construit `api`, `web`, `tooling` et les images de monitoring ; `tooling` contient `content/`                                                                          | GitHub Actions, poussé vers GHCR                                                     |
| Deploy   | `migrate` : `prisma migrate deploy`, puis `db:seed`                                                                                                                               | l'image d'outillage, sur le serveur                                                  |
| Runtime  | L'api lit les leçons dans Postgres et appelle le LLM seulement pour les réapprovisionnements, les discussions et le test de la clé de la page de profil (`POST /api/tutor/check`) | le container `api`, qui n'a pas de `content/`                                        |

Rien ne génère de leçon au moment du build, du deploy ou du seed.

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

### Apprenants de démo

Avec `DEMO_PASSWORD` défini dans le `.env` du serveur, le seed supprime ensuite les six apprenants
de démo (`demo-anna@example.com` à `demo-felix@example.com`) et les reconstruit, avec leurs amitiés
et leurs messages, comme `make seed` le fait dans un checkout (`demoSkipReason` dans
`apps/api/prisma/seed.ts`). Vide, il note `demo learners skipped: DEMO_PASSWORD is empty` et ne
supprime rien (voir la fin de cette section). Seul `migrate` reçoit le mot de passe, jamais
l'api. Colle-le comme le webhook. Un `.env` copié de l'ancien `infra/deploy/.env.example` n'a pas
la clé, et `sed` ne change rien sur une ligne absente : ajoute-la d'abord, vide :

```bash
[ -z "$(tail -c1 .env)" ] || echo >> .env
grep -q '^DEMO_PASSWORD=' .env || echo 'DEMO_PASSWORD=' >> .env
read -rs pw && sed -i "s|^DEMO_PASSWORD=.*|DEMO_PASSWORD=$pw|" .env && unset pw
```

Il doit passer les règles de l'inscription (12 à 128 caractères, une minuscule, une majuscule et
un chiffre), sinon le seed échoue avant d'écrire quoi que ce soit, et la release avec lui : le seul
cas où les apprenants de démo arrêtent un déploiement. Garde des lettres et des
chiffres : compose lit un `$` comme une variable. Un apprenant qui échoue ensuite (quelqu'un a pris
son `demo.<name>`, ou l'hôte est trop lent pour les transactions du replay) est noté
`demo learner … skipped:`, et la release continue. Quand les six sont construits, le seed note
`seeded 6 of 6 demo learners: …`. Comme il tourne à chaque release :

- leur « aujourd'hui » est celui de la release : le jour où tu les montres, lance d'abord la
  commande `migrate` ci-dessus (`deploy.sh` ne la relance que quand une image a changé), pendant
  que le timer de déploiement est au repos, pour que deux seeds ne se croisent pas. Lance le seed
  et montre-les entre 05:00 et 15:00 UTC (dès 04:00 en été) : de minuit à New
  York à minuit à Tokyo, les six fuseaux sont à la même date, donc la journée d'aucun apprenant ne
  bascule entre le seed et la démo ;
- quiconque connaît le mot de passe peut se connecter comme l'un d'eux et changer ce que cet
  apprenant montre (leçons, pseudo, avatar, 2FA) jusqu'au prochain seed qui les reconstruit ; un
  avatar envoyé ainsi reste dans le volume des avatars ;
- chaque seed déconnecte quiconque est connecté comme l'un d'eux, et supprime leurs amitiés et
  leurs conversations entières, messages d'un vrai utilisateur compris ;
- un compte que quelqu'un a créé sous l'une de ces six adresses est supprimé aussi, et aucun
  autre : `demo-me@example.com` reste. Rien d'autre d'un vrai utilisateur n'est touché : les
  leçons sont seulement lues.
- la ligne Learning → Learners de Grafana les montre dans Courses by level, Achievements earned et
  Friendships, mais pas dans Lesson attempts per hour : le seed tourne dans `migrate`, pas dans
  l'api, donc ses leçons rejouées n'atteignent jamais `ft_lesson_attempts_total`. Ce panneau bouge
  dès que quelqu'un termine une leçon dans l'app.

Vider `DEMO_PASSWORD` empêche les seeds suivants de les construire, mais ne supprime rien : les
apprenants qu'un seed précédent a construits restent, toujours ouverts avec ce mot de passe. Pour
les supprimer, avec ce qui en dépend en cascade, comme un seed le fait :

```bash
docker compose -f compose.deploy.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DELETE FROM "User" WHERE email IN ('demo-anna@example.com', 'demo-ben@example.com',
  'demo-chloe@example.com', 'demo-david@example.com', 'demo-eva@example.com',
  'demo-felix@example.com');
SQL
```

Copier un nouveau `compose.deploy.yml` ou modifier `.env` ne déploie rien
([Les deploys automatiques](#les-deploys-automatiques)) : lance la commande `migrate`, ou attends
la prochaine release.

---

## Redéployer

Les trois mêmes commandes. Lance la migration avant `up -d`, pour que le schema soit en place quand le nouveau code
démarre.

`IMAGE_TAG` vaut `latest` par défaut, qui suit `main`. Fixe-le sur un tag `main-<sha>` dans `.env`
pour garder une release ou revenir en arrière. Avec `compose.deploy.monitoring.yml` en place, le plus ancien tag
qui marche est le merge de #129, le premier à publier les images de monitoring. Pour remonter plus loin,
copie le fichier compose de ce commit sur le serveur et retire d'abord l'overlay
(`git show <sha>:compose.deploy.yml`), sinon le pull échoue sur les images de monitoring.

### Un `.env` d'un ancien modèle

Un `.env` de serveur garde l'ordre et les commentaires du modèle d'où il a été copié, et il lui manque les clés
ajoutées depuis. `scripts/align-env.sh` le réécrit dans l'ordre et avec les commentaires du modèle actuel, garde
chaque valeur, et ajoute les nouvelles clés avec la valeur par défaut du modèle. Une clé que le modèle n'a plus
reste à la fin, sous `# Not in the template`, et son nom est affiché sur stderr. Le script n'affiche que des noms
de clés, jamais une valeur, et refuse un `.env` où une clé est définie deux fois. L'ancien fichier reste en
`.env.bak`, en mode 600, secrets compris. Depuis le dépôt, vers le secondaire (pour le principal, copie
les deux mêmes fichiers vers `AntaresVps:ft_transcendence/`) :

```bash
scp .env.example scripts/align-env.sh ubuntu@140.238.209.2:~/
```

Sur le serveur, avec un hash de la config résolue avant et après, qui montre que rien n'a changé en pratique sans
l'afficher (ajoute chaque overlay que l'hôte a après `-f compose.deploy.yml`, comme le fait `deploy.sh`) :

```bash
docker compose -f compose.deploy.yml --profile migrate config --format json | sha256sum
sh align-env.sh .env .env.example
docker compose -f compose.deploy.yml --profile migrate config --format json | sha256sum
```

Le même hash veut dire que rien n'a changé et que rien n'a besoin d'un redémarrage : `rm .env.bak align-env.sh`.
Un hash différent veut dire que le modèle a apporté une valeur par défaut que l'ancien `.env` n'avait pas : lis la
différence masquée, `diff <(sed 's/=.*/=/' .env.bak) <(sed 's/=.*/=/' .env)`, avant de supprimer `.env.bak`.
Jamais un `diff` simple des deux fichiers : il affiche les secrets.

---

## Les deploys automatiques

Un timer sur la machine fait un pull toutes les cinq minutes et redéploie seulement quand une image a changé. On tire
depuis le serveur plutôt que de laisser GitHub Actions s'y connecter, donc il n'existe aucun identifiant de deploy qui pourrait fuiter.
Les deux hôtes le font tourner ; les commandes plus bas sont celles de la copie Oracle, et celles du principal sont
dans [sa section](#le-principal-derrière-un-autre-reverse-proxy).

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

Chaque lancement commence par `docker image prune -f`, qui supprime seulement les images qu'aucun container
n'utilise. Un deploy raté s'arrête avant la fin du script, donc un nettoyage seulement après un deploy réussi ne
suffit pas. En novembre 2026, la base de données est morte sur l'hôte Oracle, chaque deploy a échoué à l'étape
migrate, et les images de release tirées à chaque essai (environ 3 Go chacune) ont rempli le disque de 45 Go en
11 jours.

`deploy.sh` ajoute `compose.deploy.monitoring.yml` et `compose.deploy.proxy.yml` à chaque commande compose
quand ils sont à côté de lui, donc ce sont les fichiers sur l'hôte qui choisissent la stack.

Prometheus, Alertmanager et Grafana sont des images construites par images.yml avec leur config dedans, donc
une règle ou un dashboard mergé dans `main` se déploie comme du code. Un changement de `compose.deploy.yml`,
de `compose.deploy.monitoring.yml` ou de `Caddyfile.prod`, versions des exporters comprises, demande toujours le
`scp` et le `up -d` à la main, plus `docker compose -f compose.deploy.yml restart caddy` pour le
Caddyfile : Caddy le lit seulement au démarrage, et `up -d` ne recrée pas caddy pour un fichier modifié.

Un hôte qui fait tourner le monitoring depuis un `compose.deploy.yml` plus ancien que l'overlay a besoin de
`compose.deploy.monitoring.yml` et du nouveau `deploy.sh` dans le même `scp` que le nouveau
`compose.deploy.yml`. Le nouveau fichier seul n'a aucun service de monitoring : le deploy suivant laisserait
les sept containers tourner sur leurs anciennes images, et plus rien ne les mettrait à jour.

---

## Mémoire

Le shape que la section 2 met en place pour la copie Oracle est `VM.Standard.E2.1.Micro` : 1 GB de RAM et une
fraction d'un cœur partagé. Sur l'instance en ligne, `free -m` montre 954 MiB, `nproc` 2, avec un swapfile de 2 GB et un disque de 45 GB (2026-11-27). L'app (Postgres, Redis, Next, Nest, Caddy) prend environ 450 MB, et le monitoring
ajoute environ 330 à 450 MB d'après une estimation. Mesure avant de te fier à ces chiffres :

```bash
free -m                     # total, available, swap
docker stats --no-stream    # per container, against its limit
uname -m; nproc
```

C'est pour ça que le monitoring est un overlay : un hôte qui n'a pas la mémoire pour lui laisse
`compose.deploy.monitoring.yml` de côté et fait tourner l'app seule
([Le monitoring sur un serveur](#le-monitoring-sur-un-serveur)). La copie Oracle tourne comme ça. Le principal
fait tourner le monitoring.

Chaque service de monitoring a un `mem_limit` strict dans `compose.deploy.monitoring.yml`, 800 MB en tout,
pour qu'un service qui s'emballe soit tué (OOM-killed) et redémarré, au lieu que le noyau choisisse l'app.

| Service                           | `mem_limit` | Au repos                  |
| --------------------------------- | ----------- | ------------------------- |
| prometheus                        | 256m        | 80 à 150 MB, estimé       |
| grafana                           | 320m        | environ 180 MB, mesuré    |
| alertmanager                      | 64m         | 15 à 25 MB, estimé        |
| node-exporter, postgres-exporter  | 48m chacun  | 10 à 20 MB chacun, estimé |
| redis-exporter, blackbox-exporter | 32m chacun  | 8 à 15 MB chacun, estimé  |

Prometheus et Grafana reçoivent aussi un quart du poids CPU par défaut (`cpu_shares: 256`), donc
sur un cœur partagé ils laissent passer l'app. Prometheus garde au plus 15 jours ou 1 GB sur le disque.

Sur une machine de 1 GB, ajoute un fichier de swap de 2 GB avant le premier `up` :

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

## Le monitoring sur un serveur

Le monitoring, c'est l'overlay `compose.deploy.monitoring.yml` : selon que le fichier est sur l'hôte ou non,
il est allumé ou éteint. Sans lui, l'hôte fait tourner l'app seule, n'a besoin d'aucune clé Grafana, et
`/grafana` répond 503 avec `Monitoring is not running on this host.` Avec lui, les sept services
sont toujours allumés, sans profil.

Le principal le fait tourner. La copie Oracle, non : sa VM gratuite n'a pas assez de mémoire
([Mémoire](#mémoire)).

Pour l'allumer, une seule fois, sur un hôte qui a la mémoire pour lui, comme la copie sur un shape plus grand.
L'ordre compte, parce que les fichiers du serveur ne changent qu'à la main.

**1. Mesure.** `free -m`, `uname -m`, `nproc` et `docker stats --no-stream`. Si la mémoire totale
est d'environ 1 GB, ajoute d'abord le fichier de swap ([Mémoire](#mémoire)).

**2. Ajoute les clés dans `.env`.** Avant l'overlay : il refuse de démarrer sans les deux
clés de Grafana, et ça arrêterait aussi `deploy.sh`. Un `.env` écrit sans monitoring peut ne pas les avoir, et
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

**3. Déploie.** Depuis le dépôt :

```bash
scp compose.deploy.yml compose.deploy.monitoring.yml infra/deploy/deploy.sh ubuntu@140.238.209.2:~/
scp infra/caddy/Caddyfile.prod ubuntu@140.238.209.2:~/Caddyfile
```

Sur le serveur, lance le deploy maintenant au lieu d'attendre le timer, puis redémarre caddy.
`deploy.sh` compte les images de l'overlay comme un changement, donc il déploie même quand aucune release n'a bougé :

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

**4. Vérifie.** Ouvre `https://<SITE_DOMAIN>/grafana` et connecte-toi en `admin`, avec le
mot de passe donné par `grep GRAFANA_ADMIN_PASSWORD .env`. Overview doit être vert. Si un webhook est défini,
envoie une alerte de test ([operations/monitoring.md](monitoring.md) section 4, avec
`docker compose -f compose.deploy.yml -f compose.deploy.monitoring.yml` à la place de
`docker compose`). Puis surveille `free -m` et `docker stats --no-stream` pendant une journée avant de te
fier aux limites.

**5. Revenir en arrière.** Si la machine swappe beaucoup ou que l'app est tuée par l'OOM killer, retire
l'overlay. Sur le serveur :

```bash
rm compose.deploy.monitoring.yml
docker compose -f compose.deploy.yml up -d --remove-orphans
```

Ajoute `-f compose.deploy.proxy.yml` après `-f compose.deploy.yml` derrière un proxy de devant. Ça
supprime les sept containers de monitoring et garde leurs volumes, donc remettre le fichier plus tard
retrouve les mêmes données, et `/grafana` répond 503. `deploy.sh` continue de déployer l'app seule.
`docker compose stop` ne tient pas : le `up -d` de `deploy.sh` l'annule à la release suivante.

Sans l'overlay, l'api ouvre toujours son port de métriques sur le réseau compose, et rien ne le
scrape. Ce n'est pas un problème : aucun port n'est publié.

**Avant l'overlay.** À partir de #129 (2026-10-18), le monitoring était dans `compose.deploy.yml` lui-même,
toujours allumé, et cette section était une procédure à faire une seule fois pour le serveur de l'époque. La seule
façon de tourner sans monitoring était alors le fichier compose d'avant #129, à qui manque chaque changement
fait depuis, les limites de logs comprises. Cette procédure vérifiait aussi d'abord que les trois nouveaux
paquets GHCR étaient publics, puisqu'un nouveau paquet peut démarrer en privé et qu'un serveur n'a pas de login
au registry. Le principal les tire depuis, sans login.

---

## Le principal, derrière un autre reverse proxy

Le déploiement principal tourne en ligne à **https://trans.vyantares.ch**, sur le VPS Infomaniak partagé, où un
autre reverse proxy possède déjà 80 et 443 : là-bas, `caddy-docker-proxy` sert plusieurs projets et route
selon les labels Docker des containers qui rejoignent son réseau `web`. Le principal fait aussi tourner le
monitoring, donc il a les deux overlays. L'instance Oracle ci-dessus est la copie secondaire. Les mêmes étapes
marchent sur n'importe quel hôte où un autre proxy possède les ports HTTPS.

`compose.deploy.proxy.yml` fait la différence. Notre Caddy ne publie aucun port, rejoint le réseau du proxy
de devant, et porte les deux labels qui routent `SITE_DOMAIN` vers lui. Il sert du HTTP simple
sur ce saut, puisque le proxy de devant a le certificat, et garde tout son propre routage
(`/api`, `/grafana`, le site des métriques). Il fait aussi confiance à l'adresse transmise par le proxy de devant, pour que
les rate limits de l'API et le verrouillage du login de Grafana voient toujours chaque visiteur, et pas le proxy.

| Sur l'hôte                      | Depuis le dépôt                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `compose.deploy.yml`            | `compose.deploy.yml`                                                                                                                |
| `compose.deploy.proxy.yml`      | `compose.deploy.proxy.yml`                                                                                                          |
| `compose.deploy.monitoring.yml` | `compose.deploy.monitoring.yml`, puisque le principal fait tourner le monitoring : laisse-le de côté pour faire tourner l'app seule |
| `Caddyfile`                     | `infra/caddy/Caddyfile.prod`                                                                                                        |
| `.env`                          | `.env.example`, rempli                                                                                                              |
| `deploy.sh`                     | `infra/deploy/deploy.sh` : utilise chaque overlay présent                                                                           |

**DNS.** Un enregistrement A du nom vers l'adresse de l'hôte. Sur Cloudflare, mets-le en **DNS only**
(nuage gris) : en mode proxied, le proxy de devant voit les adresses de Cloudflare, ne leur fait pas confiance, et
tous les visiteurs derrière un même point Cloudflare partageraient une rate limit et un verrouillage.

**Fichiers**, dans leur propre dossier, puisque le dossier personnel contient d'autres projets :

```bash
ssh AntaresVps mkdir -p ft_transcendence
scp compose.deploy.yml compose.deploy.proxy.yml compose.deploy.monitoring.yml \
  infra/deploy/deploy.sh infra/deploy/ft-deploy.{service,timer} AntaresVps:ft_transcendence/
scp infra/caddy/Caddyfile.prod AntaresVps:ft_transcendence/Caddyfile
scp .env.example AntaresVps:ft_transcendence/.env
```

**`.env`** : comme dans [Déployer](#5-déployer), avec `SITE_DOMAIN` égal au nom de l'hôte
(`trans.vyantares.ch` ici) et les deux clés Grafana, puisque le monitoring tourne ici. `ACME_EMAIL` est
toujours obligatoire mais pas utilisé : c'est le proxy de devant qui demande le certificat. Définis `PROXY_NETWORK` si le
réseau du proxy de devant ne s'appelle pas `web`. Décommente `COMPOSE_PROJECT_NAME=ft_transcendence_prod`,
comme sur chaque serveur. C'est ici que ça compte le plus : le VPS partagé a un checkout de ce dépôt, et sans
lui compose prendrait le nom de projet du checkout, et ses volumes avec, base de données comprise.

**Déploie** avec le script, qui ajoute les overlays tout seul :

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
