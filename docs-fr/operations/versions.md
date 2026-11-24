# Versions

Chaque version est fixée exactement dans le fichier qui l'utilise : les fichiers `package.json`,
`pnpm-workspace.yaml`, `.nvmrc`, les Dockerfiles, les fichiers compose et les workflows. Cette page
garde seulement ce que ces fichiers ne peuvent pas dire : ce qui doit bouger ensemble, ce qui est retenu et quand
regarder à nouveau, et les leçons qu'une mise à jour ne devrait pas avoir à réapprendre. Dernière revue complète :
**2026-11-15**.

## Ce qui bouge ensemble

| Changement              | Change aussi                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                    | `.nvmrc`, `engines.node` dans le `package.json` racine, chaque ligne `FROM node:` (`apps/api/Dockerfile` et `apps/web/Dockerfile`, les deux étapes, et `.devcontainer/Dockerfile`), `@types/node` à la même version majeure. Puis reconstruis le devcontainer.                                                                                              |
| pnpm                    | `packageManager` et `engines.pnpm` dans le `package.json` racine, et les trois lignes `npm install -g pnpm@`. Dans les images de l'app, pnpm 11 télécharge en silence la version de `packageManager` quand elles sont différentes ; le workflow du devcontainer et `make doctor` échouent à la place. Le `pnpm/action-setup` de la CI lit `packageManager`. |
| Prisma                  | `prisma`, `@prisma/client` et `@prisma/adapter-pg`, toujours à la même version.                                                                                                                                                                                                                                                                             |
| Next.js                 | `next` et `@next/eslint-plugin-next`.                                                                                                                                                                                                                                                                                                                       |
| NestJS                  | `@nestjs/core`, `common`, `platform-express`, `platform-socket.io`, `websockets` et `testing` à une seule version, et `multer` et `socket.io` (avec `socket.io-client`) aux versions que fixent les deux paquets platform : l'api importe les deux directement.                                                                                             |
| La même version partout | `react` avec `react-dom` et les peers de `packages/ui` ; `eslint` dans chaque paquet et le peer de `packages/eslint-config` ; `tailwindcss` avec `@tailwindcss/postcss`.                                                                                                                                                                                    |
| Zod                     | Une seule version dans `packages/shared`, `apps/api` et `apps/web` : le pipe de validation compte sur `instanceof ZodError` entre les paquets.                                                                                                                                                                                                              |
| Vitest                  | `vitest`, `@vitest/coverage-v8` et `vite` (un peer obligatoire) dans les quatre paquets qui ont des tests.                                                                                                                                                                                                                                                  |
| Playwright              | Compare la liste apt du devcontainer avec les `nativeDeps` de `playwright-core` pour debian13. La CI n'a besoin de rien : elle lance la suite dans `mcr.microsoft.com/playwright:v<version>-noble` (`scripts/playwright-in-image.sh`), dont le tag suit `@playwright/test`, avec le Node du runner.                                                         |
| Images upstream         | `compose.yml` et `compose.deploy.yml` : `scripts/check-monitoring-config.sh` échoue quand caddy, db, redis ou un exporter est différent. Rien ne vérifie les autres copies : pgvector dans `ci.yml`, `hygiene.yml` et `docs/architecture/technical-plan.md`, redis dans `ci.yml`.                                                                           |
| Prometheus              | `infra/monitoring/prometheus/Dockerfile` et `prometheusVersion` dans `infra/monitoring/grafana/provisioning/datasources/datasources.yml`, que lit le constructeur de requêtes de Grafana. Rien ne vérifie qu'ils correspondent.                                                                                                                             |
| GitHub Actions          | Les tags viennent de l'API des releases de chaque action, pas d'articles de blog. `aquasecurity/trivy-action` est fixé par commit (76 de ses 77 tags ont été force-pushés vers des commits malveillants en mars 2026), avec la `version` du scanner définie.                                                                                                |

Après chaque mise à jour : `pnpm audit`, `make all`, puis `make playwright-all`.

## Ce qui est retenu

1. **TypeScript 6.0.3**, pas 7. TypeScript 7 n'a pas d'API du compilateur avant 7.1, et
   typescript-eslint (peer `<6.1.0`), `@nestjs/cli` et la vérification de types de Next la chargent tous. Fixé
   exactement, forcé dans `pnpm-workspace.yaml`, et vérifié dans la CI par
   `scripts/assert-ts-version.sh`, parce qu'un seul `pnpm up --latest` ramènerait la 7. Regarde à nouveau
   quand TypeScript 7.1 sortira son API et que typescript-eslint l'acceptera.
2. **Node 24**, pas 26. Sur Node 26, Next 16.4 découpe les données de page inline en un script par
   chunk, environ 130 fois plus de scripts et 4 fois plus d'octets (vercel/next.js#101343, corrigé seulement
   sur canary), et Prisma 7 indique 24 comme sa version de Node la plus récente. Passe à la suite quand une version stable de Next aura la correction.
   pnpm vient déjà de npm plutôt que de corepack, que Node ne fournit plus depuis la 25.
3. **NestJS 11**, pas 12. nestjs-zod 5.6 déclare encore Nest `^10 || ^11`
   (BenLorantfy/nestjs-zod#515). Nest 12 répond aussi aux chemins inconnus avec une route attrape-tout, donc
   `routeOf` dans `apps/api/src/metrics/http-metrics.middleware.ts` étiquetterait les 404 des scanners
   `/api*path` au lieu de `unmatched` : corrige ça avec la mise à jour. `@nestjs/config` 12 et
   `@nestjs/cli` 12 tournent déjà sur Nest 11.
4. **Prisma 7**. Le tag `latest` de npm pour `prisma` pointe vers une release candidate 8.0, donc ne fais jamais
   `pnpm up --latest` dessus. `CHECKPOINT_DISABLE=1` dans les images et le devcontainer empêche le
   CLI d'annoncer cette RC (#61).
5. **Prometheus 3.13**, la branche LTS (corrections jusqu'au 2027-07-31), pas la version mineure la plus récente.
6. **pnpm 11**, pas 12. pnpm 12 est une réécriture native avec des réglages plus stricts, et rien ici
   n'en a encore besoin. `updateNotifier: false` dans `pnpm-workspace.yaml` empêche pnpm de l'annoncer.

Connu et accepté : `pnpm audit` signale des alertes de sécurité seulement dans des outils de développement, `brace-expansion`,
`js-yaml` 4 et `deepmerge` sous le plugin de vérification de types de `@nestjs/cli`, et `minimatch` sous ESLint.
`pnpm audit --prod` liste encore `minimatch`, parce que `packages/eslint-config` déclare les plugins d'ESLint
comme ses propres dépendances. Aucun n'arrive dans une image de prod : l'image api contient seulement les
dépendances de production de l'api (`pnpm deploy`, dans son étape `prune`), et l'image web seulement ce que
la sortie standalone de Next trace. Ils sont dans l'image d'outillage (l'étape `build` de l'api), qui sert seulement à
migrer et à seeder, et que Trivy ne scanne pas.

## Leçons gardées

- **Les scripts de build de pnpm 11.** Seuls les paquets listés dans `allowBuilds` (`pnpm-workspace.yaml`) lancent
  leurs scripts d'installation. Les clés de pnpm 10 sont ignorées sans un mot, et Prisma alors ne marche
  simplement pas. pnpm 11 ne lit rien d'autre que les réglages d'auth et de registry dans `.npmrc`, donc il n'y en a pas.
- **L'âge des releases.** pnpm refuse une version de moins de 24 heures (`minimumReleaseAge`), ce qui
  limite les prises de contrôle de comptes npm : garde-le. Quand une version fixée est plus récente, pnpm écrit une exclusion dans
  `pnpm-workspace.yaml` ; commite-la. Avec `minimumReleaseAgeExcludePrune`, `pnpm add`, `update`
  et `remove` retirent une entrée dès que le lockfile n'a plus cette version.
- **Prisma dans des images slim.** Le CLI a besoin de `openssl` et `ca-certificates` (l'étape `base`) ;
  le runtime non. Le client sans Rust ne peut pas joindre Postgres sans `@prisma/adapter-pg`,
  une dépendance du runtime.
- **pgvector.** L'image `postgres` de base n'a pas pgvector, d'où `pgvector/pgvector`. Jamais
  en dessous de 0.8.2 : CVE-2026-3172, un buffer overflow dans les constructions parallèles d'index HNSW. `CREATE EXTENSION IF NOT EXISTS vector` va dans la première migration qui en a besoin : la
  shadow database de la CI rejoue les migrations et rien d'autre.
- **La source des images.** Les images de la famille Prometheus viennent de ghcr.io, sans la limite anonyme
  de Docker Hub de 100 pulls toutes les 6 heures, qu'un NAT d'école partage. Grafana est
  `grafana/grafana` ; `grafana/grafana-oss` s'est arrêté à 13.0.2. Chaque image existe en amd64 et arm64 :
  vérifie avec `docker buildx imagetools inspect <ref>`.
- **Dev Containers et Bake.** Compose construit avec Buildx Bake, qui refuse le Dockerfile
  que le CLI Dev Containers génère dans son dossier temporaire, sauf si une feature fait passer ce
  dossier par le CLI comme contexte de build ("additional privileges requested: --allow=fs.read=..."). La feature
  vide `.devcontainer/features/bake-compat` existe seulement pour ça : vu en 2026-11 avec Compose
  2.39 et 5.6, Buildx 0.38, Dev Containers 0.475. Pour savoir si elle est encore nécessaire, enlève son
  entrée de `devcontainer.json` et reconstruis le container : s'il se construit encore, supprime aussi le
  dossier et `devcontainer-lock.json`.
- **Choisi plutôt que l'option évidente.** `@prometheus-io/client`, pas `prom-client` (déprécié) ni
  `@willsoto/nestjs-prometheus`, qui sert les métriques sur le port public. `otpauth` (une
  dépendance), pas `otplib` (six). `qrcode-generator`, pas `qrcode`, qui amène `yargs` dans
  l'image du runtime. `redis` (node-redis), parce que `connect-redis` l'a comme peer. `@types/express` est
  déclaré parce que pnpm ne le remonte pas (hoist). postgres_exporter 0.20 a renommé des métriques, donc les anciens
  dashboards de la communauté ne correspondent pas. redis_exporter est une image scratch : pas de shell, pas de healthcheck.
- **Trivy signale, ne bloque jamais.** Sinon, une alerte publiée après un commit rendrait rouge
  une PR verte sans que le diff change. Les étapes de prod suppriment npm, npx, corepack et yarn :
  leurs paquets intégrés étaient les seuls problèmes trouvés, et le runtime ne les utilise jamais.
