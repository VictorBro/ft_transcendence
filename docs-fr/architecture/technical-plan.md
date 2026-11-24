# Plan technique

Statut : **adopté**. Écrit avant le scaffold (squelette du projet), gardé comme trace des décisions d'infrastructure ; là où la construction est différente, ce fichier le dit.
À lire avec : [subject/summary.md](../subject/summary.md) (les exigences), [operations/versions.md](../operations/versions.md) (ce qui bouge ensemble, ce qui est retenu).

Produit : **plateforme d'apprentissage des langues étrangères pilotée par l'IA**. Un catalogue de leçons écrites à la main avec
des leçons notées par le serveur, un placement CECR adaptatif dont un LLM réapprovisionne la banque de questions, un tuteur LLM
avant chaque examen de leçon, et des fonctions sociales en direct par WebSockets.

---

## 1. Stack

| Couche           | Choix                             | Pourquoi                                                                                                                                                                                                       |
| ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend         | **Next.js** (App Router)          | Module majeur Framework. Point mineur SSR. `next-intl` pour le module i18n. Pages publiques indexables.                                                                                                        |
| Backend          | **NestJS**                        | Gateways WebSocket, DI (provider LLM facile à mocker), guards, throttler, Swagger, pipes de validation. Les frontières des modules correspondent aux membres de l'équipe.                                      |
| Base de données  | **Postgres 18 + pgvector**        | Données relationnelles. pgvector avait été choisi pour le RAG, qui a été abandonné ([modules/README.md](../modules/README.md#non-annoncés), « Non annoncés ») ; l'extension reste dans l'image, inutilisée.    |
| ORM              | **Prisma 7**                      | Module mineur ; `schema.prisma` sert aussi de doc du schema dans le README.                                                                                                                                    |
| Cache / sessions | **Redis**                         | Sessions, passages de placement, limites de débit de la discussion de leçon, présence.                                                                                                                         |
| Proxy            | **Caddy**                         | Point d'entrée TLS unique (HTTPS obligatoire). La même origine supprime le besoin de CORS ; les cookies httpOnly marchent tout seuls. CA interne pour les certificats de dev.                                  |
| Temps réel       | **socket.io**                     | Présence, mises à jour en direct des cours et des amis, messages privés. La discussion de leçon passe plutôt en stream par Server-Sent Events sur une route REST ([architecture/realtime.md](realtime.md) §4). |
| Monorepo         | **workspaces pnpm + Turborepo**   | node_modules strict ; tâches en cache.                                                                                                                                                                         |
| Contrats         | **Zod dans `packages/shared`**    | Un seul schema valide le frontend et le backend (exigence obligatoire).                                                                                                                                        |
| Tests            | **Vitest, Supertest, Playwright** | Tests unitaires, e2e de l'API, e2e dans le navigateur + contrôle de la console.                                                                                                                                |

### La règle d'architecture

> **NestJS possède toute la logique métier et l'accès aux données. Next.js fait seulement la présentation et le SSR.**
> Pas de client Prisma dans `apps/web`, pas de logique métier dans les server actions.
> Le serveur de Next appelle NestJS par le réseau Docker interne.

À la soutenance, « quel runtime possède quoi » doit avoir une réponse en une phrase. Cette règle est cette réponse.

---

## 2. Organisation du repository

```
ft_transcendence/
├── .devcontainer/
│   ├── devcontainer.json          # → ../compose.yml + ../compose.override.yml, service: workspace
│   ├── initialize.sh              # host side, before every open: fits .env to the Docker daemon
│   └── Dockerfile                 # workspace tooling image: node, pnpm, gh, docker CLI
├── .github/
│   ├── workflows/                 # ci.yml · e2e.yml · images.yml · hygiene.yml · devcontainer.yml (§5)
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   ├── web/                       # Next.js, 6-stage Dockerfile
│   └── api/                       # NestJS, the same 6 stages plus `prune`
├── packages/
│   ├── shared/                    # Zod schemas, socket event contracts
│   ├── ui/                        # shared components (the design-system module is not claimed)
│   ├── eslint-config/
│   └── tsconfig/
├── infra/
│   ├── caddy/                     # Caddyfile (local stacks), Caddyfile.prod (deployments)
│   ├── monitoring/                # Prometheus, Alertmanager and Grafana config
│   └── deploy/                    # deploy.sh and its systemd service and timer
├── content/                       # outlines, lesson briefs and files, placement items
├── e2e/                           # Playwright tests
├── scripts/                       # shell scripts that CI and make run
├── docs/
├── compose.yml                    # topology: caddy · web · api · db · redis, plus the monitoring stack
├── compose.override.yml           # dev, auto-loaded: dev targets, bind mounts, workspace service
├── compose.prod.yml               # prod targets, no mounts, restart policies
├── compose.deploy.yml             # deployments: pulls the released images, never builds
├── compose.deploy.proxy.yml       # overlay for a host where another reverse proxy owns 80 and 443
├── Makefile
├── turbo.json · pnpm-workspace.yaml · .env.example · README.md
```

Note sur le scaffold : `create-next-app` / `nest new` génèrent des projets autonomes (avec leur propre `.git` et leur
lockfile). Fais le scaffold dans un dossier temporaire, déplace `src/` + la config de l'app dans `apps/*`, supprime le reste.

### Les découpages en modules NestJS, tels que construits

Le plan avait sept découpages (`auth`, `users`, `lessons`, `assessment`, `ai`, `realtime`,
`common`). Le code les a découpés davantage :

```
apps/api/src/
├── auth/                 # signup, login, sessions, the global AuthGuard, 2FA
├── users/                # profiles, avatars, public profiles, time zone, interface language
├── courses/              # a course per (user, language): goal, level, active course
├── placement/            # the adaptive placement exam, its state in Redis
├── items/                # the spec that checks content/items/
├── question-generation/  # restocking the bank with the LLM
├── lessons/              # catalogue, daily view, search, attempts, discussion, gamification
├── llm/                  # LlmProvider: fixture, gemini, disabled; generateStructured, streamText
├── gateway/              # socket.io on /ws: handshake, screen, rooms
├── friends/  presence/  messages/   # Milestone 3 social features
├── metrics/              # Prometheus registry and the :9464 listener
├── demo/                 # demo learners, seeded on development stacks only
├── throttler/  prisma/  redis/  health/
└── validation.pipe.ts, error-code.filter.ts   # Zod validation, error codes
```

---

## 3. Docker

Les deux apps utilisent les mêmes noms de stages ; l'api ajoute un stage `prune` entre `build` et `prod` :

| Stage   | Contenu                                                         | Utilisé par                 |
| ------- | --------------------------------------------------------------- | --------------------------- |
| `base`  | `node:24.22.3-trixie-slim`, pnpm depuis npm                     |                             |
| `deps`  | `pnpm install --frozen-lockfile`, cache mounts BuildKit         |                             |
| `dev`   | toutes les dépendances, source montée en bind mount, `pnpm dev` | compose.override            |
| `ci`    | dépendances + source, lance les tests, produit la couverture    | jobs e2e/test de la CI (§5) |
| `build` | compile (Next standalone / Nest dist)                           |                             |
| `prod`  | runtime uniquement, non-root, tini, HEALTHCHECK                 | compose.prod, GHCR          |

Règles :

- **Debian slim, pas Alpine.** Les moteurs Prisma + les modules natifs (argon2) sur musl/arm64, c'est une famille de bugs
  qu'on ne veut pas pendant la semaine de soutenance.
- **Multi-arch :** lance `pnpm install` et `prisma generate` dans chaque stage de l'architecture cible. Ne fais jamais
  de `COPY --from` de node_modules d'une architecture à une autre.
- **node_modules contre bind mounts :** les services de dev montent la source en bind mount, mais les dépendances vivent dans
  l'image. Masque-les avec un volume nommé par chemin `node_modules` et installe au démarrage du container.
  Sans ça, les dépendances de l'hôte et du container entrent en conflit (l'échec classique de pnpm dans Docker).

### Topologie

```
:443 → caddy → /        → web (Next.js)
              → /api /ws → api (NestJS) → postgres+pgvector, redis
```

Seul caddy publie un port ; tout le reste est interne, ce que le sujet autorise explicitement.
Image de la base de données : `pgvector/pgvector:0.8.7-pg18-trixie` (le `postgres` simple n'a pas pgvector).

### Devcontainer

`devcontainer.json` : `dockerComposeFile: ["../compose.yml", "../compose.override.yml"]`,
`service: workspace`, `workspaceFolder: /workspace`.

- Le service `workspace` est défini dans `compose.override.yml` sous `profiles: ["devcontainer"]`,
  buildé depuis `.devcontainer/Dockerfile`. Cibler explicitement un service avec profile active son
  profile, donc le devcontainer le lance alors qu'un simple `make dev` l'ignore.
- L'utilisateur de la session dépend du daemon : `user: ${WORKSPACE_USER:-node}` sur le service et pas de
  `remoteUser` dans `devcontainer.json`. `.devcontainer/initialize.sh` (le `initializeCommand`, sur
  l'hôte) écrit `WORKSPACE_USER=root` et le `DOCKER_SOCKET` propre à l'utilisateur dans `.env` sur un daemon
  rootless, où root dans le container est l'utilisateur de l'hôte, et déplace les ports publiés qui ne peuvent pas être ouverts.
  Sur un daemon rootful, il ne change rien.
- Choisis `shutdownAction` exprès : la valeur par défaut `stopCompose` arrête toute la stack (db comprise)
  quand VS Code se ferme.
- **L'état survit aux rebuilds grâce à des volumes nommés** sur le service workspace (les devcontainers basés sur compose
  prennent leurs montages dans le fichier compose, pas dans `devcontainer.json`) :
  - `claude-state:/home/node/.claude` et la variable d'environnement `CLAUDE_CONFIG_DIR=/home/node/.claude`, pour que l'auth de Claude
    Code, ses réglages et l'historique des conversations arrivent tous dans le volume (sans la variable
    d'environnement, `.claude.json` est dans `$HOME`, en dehors du volume, et il est perdu au rebuild).
  - `shell-history:/commandhistory` avec `HISTFILE=/commandhistory/.history`, même idée pour
    l'historique du shell.
  - `.devcontainer/Dockerfile` doit créer ces dossiers avec l'utilisateur du container comme propriétaire, sinon les
    volumes s'initialisent avec root comme propriétaire et les écritures échouent.
  - Les volumes sont propres à chaque machine de développeur : chaque coéquipier garde sa propre auth et son propre historique.

---

## 4. Makefile

**Un simple `make` est le chemin de l'évaluateur** : il exécute les checks de la CI, builde les cibles prod, lance `compose.prod.yml`, migre,
fait le seed, puis lance les tests dans le navigateur. C'est la commande unique notée, et elle exécute les mêmes artefacts que ceux que teste le contrôle de la console.

```
make            # evaluator: CI checks → build (prod) → up → migrate → seed → certs → monitoring-check → Playwright
make dev        # dev stack (compose.override): hot reload, bind mounts
make down / logs / ps / shell
make test / test-e2e / lint / format / typecheck
make migrate / seed / studio / reset-db
make ci         # what CI runs, locally
make clean
```

---

## 5. CI (cinq workflows)

**Décision, hybride :** les checks rapides tournent en natif sur les runners ; tout ce qui exécute du code tourne dans
le stage Docker `ci` pour avoir le même environnement. Ça garde le stage ci de la conception d'origine
là où il compte et garde un retour rapide là où il ne compte pas.

| Workflow           | Déclencheur                                                                                                     | Jobs                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`           | PR, push sur `main`                                                                                             | Natif : vérif du format, lint, typecheck, vérif de la version TS (operations/versions.md, retenu : TypeScript). Stage Docker `ci` : tests unitaires + couverture, e2e Supertest (Postgres et Redis tournent comme services du job). Puis build.                                                              |
| `e2e.yml`          | PR, push sur `main`                                                                                             | Deux jobs par navigateur (`lesson`, `rest`), chacun avec un compose up des cibles prod, puis Playwright dans sa propre image (navigateurs et leurs paquets système compris) : parcours utilisateur, **contrôle de la console**, **pages légales** (`/privacy`, `/terms` répondent 200 avec un vrai contenu). |
| `hygiene.yml`      | PR, push sur `main`                                                                                             | gitleaks, commitlint, titre de la PR, dérive de `.env.example`, échec si `.env` est indexé, `prisma migrate diff`.                                                                                                                                                                                           |
| `images.yml`       | push sur n'importe quelle branche ; tags `v*`                                                                   | Build multi-arch à chaque commit ; tags selon le tableau plus bas.                                                                                                                                                                                                                                           |
| `devcontainer.yml` | PR qui touche `.devcontainer/`, `.nvmrc`, `package.json`, `compose.yml`, `compose.override.yml`, `.env.example` | Builde l'image du devcontainer ; Node et pnpm doivent correspondre aux versions fixées ; compose lance le service workspace en root et en node ; la vérification préalable de l'hôte s'adapte à un daemon rootless.                                                                                          |

### Multi-arch (`images.yml`)

Une matrice de runners natifs, pas QEMU :

```yaml
strategy:
  matrix:
    image: [api, web, tooling, prometheus, alertmanager, grafana]   # abridged
    platform:
      - { arch: amd64, name: linux/amd64, runner: ubuntu-24.04 }
      - { arch: arm64, name: linux/arm64, runner: ubuntu-24.04-arm }
```

Chaque job pousse par digest (`cache-from/to: type=gha`, séparé par architecture) ; un job final fusionne les digests
avec `docker buildx imagetools create`. `ubuntu-24.04-arm` est gratuit et en GA sur les repos publics (4 vCPU) ;
depuis janvier 2026, il marche aussi sur les repos privés (2 vCPU). Le repli sur QEMU n'est nécessaire que sur GHES ou
sur des installations auto-hébergées. Trivy scanne la cible prod avant le push. L'auth passe par le `GITHUB_TOKEN` intégré.

### Tags des images (`docker/metadata-action`)

Tourne à chaque commit pour qu'un Dockerfile cassé apparaisse tout de suite, pas au moment du merge.
Le déclencheur est seulement `push` : les commits de PR sont des pushs sur une branche secondaire du même repo, donc un déclencheur
`pull_request` en plus builderait tout deux fois.

| Événement                       | Tags                        |
| ------------------------------- | --------------------------- |
| Push sur une branche secondaire | `<branch>-<shortsha>`       |
| Merge sur main                  | `main-<shortsha>`, `latest` |
| Tag de release `vX.Y.Z`         | `X.Y.Z`, `X.Y`, `X`         |

Règles : `latest` suit seulement main ; `<branch>-<shortsha>` est le pointeur immuable pour les rollbacks
et la provenance des déploiements ; les releases sont des tags git semver. `docker/metadata-action` remplace les `/` dans
les noms de branche par `-` (`feat/auth` → `feat-auth-a1b2c3d`). Ajoute un nettoyage planifié des tags sans nom et des
tags de branches périmés, les pushs par commit s'accumulent vite.

### Règles des PR (ruleset GitHub sur `main`)

- Pas de push direct : tout arrive par PR.
- Checks de statut obligatoires, branche à jour : `ci`, `e2e`, `hygiene`, `images` (build).
- **Au moins 1 review d'approbation** d'un coéquipier (CODEOWNERS l'attribue) ; les approbations sont annulées à chaque
  nouveau commit.
- **La couverture bloque le merge** : les `coverage.thresholds` de vitest font échouer le job de test sous le
  minimum. **60 %** de lignes/fonctions au global ; à ajuster par package, à monter petit à petit, jamais à baisser.
- La résolution des conversations est obligatoire avant le merge.

### Pourquoi ces contrôles

| Contrôle                                                       | Protège                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Contrôle de la console (zéro erreur/avertissement, build prod) | Critère de rejet                                                            |
| Vérif des pages légales                                        | Critère de rejet                                                            |
| Hygiène du `.env`                                              | Critère de rejet                                                            |
| commitlint + CODEOWNERS + modèle de PR                         | Noté : des commits de tous les membres, des messages clairs                 |
| gitleaks                                                       | Les identifiants ne quittent jamais `.env`                                  |
| Provider LLM fixture dans la CI                                | Pas de dépense, pas de tests instables, pas de secrets dans les PR de forks |

---

## 6. Produit, IA et modèle de données

Sortis de ce plan. Le parcours de l'apprenant et le provider d'IA avec ses contrôles de coûts sont dans
[architecture/product.md](product.md), et le schema est dans [architecture/data-model.md](data-model.md).
Les modules qu'on revendique et leurs points sont listés dans [modules/README.md](../modules/README.md). Chaque
sujet a un seul endroit, donc les documents ne peuvent pas se contredire.

---

## 7. Ordre de construction

1. **Fondations** : workspace pnpm, Turborepo, packages tsconfig/eslint/prettier, Makefile.
2. **Containers** : Dockerfiles, trois fichiers compose, TLS de Caddy, image pgvector, Redis.
3. **Devcontainer** : service workspace + image, extensions VS Code fixées.
4. **CI** : chaque workflow au vert sur un hello-world avant tout travail sur les fonctionnalités ; puis activer le
   ruleset de `main` (§5 Règles des PR) pour que les règles existent avant la première vraie PR.
5. **Tranche verticale** : auth (argon2, cookie httpOnly, guard) → un modèle Prisma + une migration →
   un endpoint d'IA en stream sur `fixture` → une room socket.io (rejoindre/quitter/se reconnecter) → des pages Next
   qui consomment les trois. L'endpoint d'IA en stream a été livré comme la discussion de leçon,
   [#150](https://github.com/VictorBro/ft_transcendence/issues/150) "feat(api): stream the lesson
   discussion, with error handling and rate limits" (PR #201) : Server-Sent Events sur
   `POST /api/courses/:lang/lessons/:id/discussion`, `streamText` sur la fixture et sur Gemini,
   avec sa fenêtre dans #151. Il passe en stream par SSE, pas par le socket ([architecture/realtime.md](realtime.md) §1).
6. **Tests de la tranche** : unitaires par couche, un e2e Supertest, un parcours Playwright, contrôle de la console actif.
7. **Images** : manifest multi-arch sur GHCR.
8. **Passation** : squelette du README avec toutes les sections obligatoires, **y compris la section Resources
   qui documente comment et où l'IA a été utilisée** (exigence du sujet ; ça s'applique aussi à ce plan).
   CONTRIBUTING avec les conventions de branche, de PR et de commit.

L'équipe recopie le modèle de la tranche pour chaque fonctionnalité au lieu d'en inventer cinq différents.

---

## 8. Risques

| Risque                                                                 | Parade                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm up --latest` installe TS 7                                       | Version fixée exactement + vérif de la version dans la CI (operations/versions.md, retenu : TypeScript)                                                                                    |
| Le schema et les migrations divergent                                  | `migrate diff` dans la CI à chaque PR                                                                                                                                                      |
| Node 26 LTS sort en plein projet                                       | Rester sur 24 jusqu'à ce qu'une version stable de Next corrige sa régression avec Node 26 (operations/versions.md, retenu : Node)                                                          |
| Des avertissements d'hydratation déclenchent le contrôle de la console | Contrôle actif dès le premier jour ; ça apparaît au commit qui en est la cause                                                                                                             |
| HMR lent sur les bind mounts                                           | Surveiller pendant l'étape 5. Solution de repli : `apps/web` vers Vite. **Coûte le point mineur SSR (22 → 21, toujours au-dessus des 19 qui comptent)** ; le budget dépasse quand même 14. |
| Dépenses LLM                                                           | Provider fixture dans la CI, leçons écrites hors ligne, limites de discussion par apprenant et globales, réponses plafonnées, voir architecture/product.md §5                              |
| Commits mal répartis                                                   | CODEOWNERS, reviews obligatoires, `git shortlog -sn` régulier                                                                                                                              |
