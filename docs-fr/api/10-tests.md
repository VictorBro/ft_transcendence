# Chapitre 10 — Les tests : unitaires et end-to-end

Dans ce chapitre :

- Ce qu'est un test, et les grands types : unitaire, d'intégration, end-to-end (e2e)
- Mocks, fakes et stubs : les doublures qu'un test utilise à la place de la vraie chose
- La pyramide des tests et la couverture de code
- Comment les tests tournent **ici** : Vitest (pas Jest), les deux fichiers de config, les commandes, la CI
- Une spec unitaire lue ligne par ligne : [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts)
- Une spec e2e lue ligne par ligne : [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts)
- Un tableau de chaque spec e2e et de chaque fixture dans [apps/api/test](../../apps/api/test)
- Un tableau de chaque spec unitaire (`*.spec.ts`) dans [apps/api/src](../../apps/api/src), par module
- Le dossier `coverage/`

---

## 1. Théorie : c'est quoi, un test ?

Un **test** est un petit programme qui lance ton vrai code et vérifie le résultat. Si le résultat n'est pas celui
que tu attends, le test **échoue** et affiche pourquoi. Tu l'écris une fois, et ensuite l'ordinateur revérifie la
même chose à chaque changement, en quelques secondes.

Chaque test a les trois mêmes parties (souvent appelées _Arrange, Act, Assert_) :

1. **Arrange** (préparer) : prépare les entrées et le monde autour du code.
2. **Act** (agir) : appelle le code.
3. **Assert** (vérifier) : vérifie le résultat avec `expect(...)`.

### L'exemple de la voiture

Pense à une usine de voitures.

| Type de test              | Dans l'usine de voitures                                                                                                   | Dans cette API                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Test unitaire**         | Mettre une pièce (les freins) sur un banc et la tester seule. Le reste de la voiture est remplacé par une machine de test. | Tester une classe ou une fonction (par exemple `AuthService`) avec la base de données remplacée par un fake. |
| **Test d'intégration**    | Monter les freins sur les roues et vérifier qu'ils marchent ensemble.                                                      | Tester quelques vraies pièces ensemble (par exemple un service avec un vrai Redis).                          |
| **Test end-to-end (e2e)** | Conduire toute la voiture sur une vraie route.                                                                             | Démarrer toute l'app Nest, envoyer de vraies requêtes HTTP, utiliser un vrai Postgres et un vrai Redis.      |

Un test unitaire est **rapide** et te dit **exactement** quelle pièce est cassée. Un test e2e est **lent**, mais il
prouve que toutes les pièces marchent vraiment **ensemble** (le guard, le pipe, le cookie de session, la base de
données...). Les deux sont nécessaires.

### Mocks, fakes et stubs

Dans un test unitaire, on ne veut pas de vraie base de données. On met une **doublure** à sa place. Il y a trois
noms courants (les gens les mélangent souvent, et ce n'est pas grave) :

| Nom      | Ce que c'est                                                                                           | Exemple ici                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Stub** | Renvoie une réponse fixe, rien de plus.                                                                | `prisma.user.findUnique.mockResolvedValue(null)` : « l'utilisateur n'existe pas ».                                            |
| **Mock** | Un stub qui **enregistre** aussi comment il a été appelé, pour que le test puisse vérifier les appels. | `vi.fn()` de Vitest : `expect(prisma.user.create.mock.calls[0][0].data.email).toBe(...)`.                                     |
| **Fake** | Une petite version qui marche de la vraie chose, gardée en mémoire.                                    | `fakeRedis()` dans [placement.fixtures.ts](../../apps/api/test/placement.fixtures.ts) : un tout petit Redis fait d'une `Map`. |

Une **fixture** est une donnée de test préparée (un fichier JSON, une ligne d'utilisateur, une fonction qui en
construit une).

### La pyramide des tests

```mermaid
flowchart TB
    E2E["tests e2e<br/>19 fichiers dans test/<br/>lents, vrai Postgres + Redis"]
    UNIT["tests unitaires<br/>56 fichiers *.spec.ts dans src/<br/>rapides, pas de base de données"]
    E2E --- UNIT
    style E2E fill:#f6d5a8,stroke:#a0522d
    style UNIT fill:#bfe3c0,stroke:#2e7d32
```

L'idée : **beaucoup** de tests unitaires rapides en bas, **moins** de tests e2e lents en haut. Les tests dans le
navigateur (Playwright, dans le dossier [e2e/](../../e2e) à la racine) sont encore plus haut ; ils appartiennent
à l'app web et à toute la stack, pas à ce chapitre.

### La couverture

La **couverture de code** (code coverage) mesure quelles lignes de ton code les tests ont exécutées. 80 % de
couverture des lignes veut dire que 80 % des lignes ont été exécutées au moins une fois pendant les tests. Ça ne
prouve **pas** que le code est correct (une ligne peut tourner sans être vérifiée), mais un chiffre bas montre du
code qu'aucun test ne touche du tout. Ici, les tests unitaires doivent couvrir au moins **60 % des lignes et 60 % des
fonctions**, sinon la commande échoue.

---

## 2. Comment les tests tournent ici

### Vitest, pas Jest

Beaucoup de tutoriels NestJS utilisent **Jest**. Ce projet utilise **[Vitest](https://vitest.dev)**, un lanceur de
tests avec presque la même API (`describe`, `it`, `expect`, `beforeEach`) mais construit sur Vite. Il n'y a **pas de
clé `jest`** dans [package.json](../../apps/api/package.json) et pas de `jest-e2e.json`. À la place, il y a deux
fichiers de config :

| Fichier                                                       | Lance               | Fichiers qu'il prend    |
| ------------------------------------------------------------- | ------------------- | ----------------------- |
| [vitest.config.mts](../../apps/api/vitest.config.mts)         | les tests unitaires | `src/**/*.spec.ts`      |
| [vitest.config.e2e.mts](../../apps/api/vitest.config.e2e.mts) | les tests e2e       | `test/**/*.e2e-spec.ts` |

Dans un fichier de test, tout vient de `vitest` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

`vi` est la boîte à outils de Vitest : `vi.fn()` crée une fonction mock, `vi.useFakeTimers()` fige l'horloge,
`vi.resetAllMocks()` vide tous les mocks.

### La config unitaire : [vitest.config.mts](../../apps/api/vitest.config.mts)

```ts
  plugins: [
    // Nest's injector reads constructor parameter types off `design:paramtypes`.
    // Neither esbuild nor a plain type-stripping transform emits that metadata,
    // so swc has to do the transform or every test that resolves a provider
    // fails with "Nest can't resolve dependencies".
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    // app.setup.ts refuses to load without it, and a unit test should not depend
    // on the developer's shell. Nothing here writes a file.
    env: { AVATAR_STORAGE_DIR: '/tmp/ft-avatars-unit' },
```

Ce que fait chaque partie :

- **`swc.vite(...)`** : Vitest doit transformer le TypeScript en JavaScript. L'injection de dépendances de Nest
  (chapitre 1) lit les **types des paramètres du constructeur** dans des « métadonnées » cachées que seuls certains
  compilateurs écrivent. `swc` les écrit. Le transformateur par défaut de Vite 8, `oxc`, peut aussi les écrire,
  mais il est désactivé avec `oxc: false` pour que swc soit le seul transformateur et que les métadonnées ne
  dépendent jamais de celui des deux qui est passé en premier. Sans ça,
  chaque test qui demande un provider à Nest échoue avec « Nest can't resolve dependencies ».
- **`include`** : seulement les fichiers sous `src/` qui finissent par `.spec.ts`.
- **`setupFiles: ['reflect-metadata']`** : charge la petite bibliothèque qui stocke ces métadonnées, avant tous les
  tests.
- **`env`** : fixe `AVATAR_STORAGE_DIR`, car [app.setup.ts](../../apps/api/src/app.setup.ts) refuse de se
  charger sans.

Le même fichier contient les règles de couverture :

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Bootstrap wiring and DI-only module classes carry no logic to assert;
      // the e2e suite exercises them instead.
      exclude: [
        'src/main.ts',
        'src/app.setup.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        // Prisma's emitted client: not our code, and large enough to swamp the
        // thresholds below.
        'src/generated/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
      },
    },
```

`v8` est le moteur de couverture intégré à Node. `text` affiche un tableau dans le terminal, `lcov` écrit les
fichiers du dossier `coverage/` (section 7). Les fichiers de module et `main.ts` sont laissés de côté : ils ne font
que brancher les choses ensemble, et les tests e2e les exécutent.

### La config e2e : [vitest.config.e2e.mts](../../apps/api/vitest.config.e2e.mts)

Elle répète le plugin swc (le commentaire explique qu'elle n'importe pas la config unitaire, car la fusion lancerait
chaque spec unitaire une seconde fois), puis :

```ts
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // app.setup requires it at import time, and CI runs this without a shell.
    // The provider is pinned so no shell carrying a real key makes a test spend.
    env: {
      AVATAR_STORAGE_DIR: '/tmp/ft-avatars-e2e',
      LLM_PROVIDER: 'fixture',
      LLM_API_KEY: '',
      // The rate limits at their defaults, whatever the shell exports: the
      // throttle tests pin those numbers.
      RATE_LIMIT_PER_MINUTE: '',
      SIGNUP_LIMIT_PER_MINUTE: '',
      LOGIN_LIMIT_PER_MINUTE: '',
    },
    // A cold container boots the whole Nest graph before the first assertion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Specs insert and delete shared catalogue rows (fixture lessons, results
    // over a whole level), so two files at once would see each other's rows.
    fileParallelism: false,
  },
```

Trois choses à remarquer :

- **`LLM_PROVIDER: 'fixture'`** et une clé vide : les tests n'appellent jamais un vrai modèle d'IA et ne dépensent
  jamais d'argent (le chapitre 6 explique le provider fixture).
- **Des timeouts longs** (30 s) : démarrer toute l'app prend du temps.
- **`fileParallelism: false`** : les fichiers e2e tournent **l'un après l'autre**, car ils partagent une seule base
  de données.

### Les commandes

Depuis [apps/api/package.json](../../apps/api/package.json) :

| Script     | Commande                                    | Ce qu'il fait                                                   |
| ---------- | ------------------------------------------- | --------------------------------------------------------------- |
| `test`     | `vitest run`                                | tous les tests unitaires, une fois                              |
| `test:cov` | `vitest run --coverage`                     | tests unitaires + rapport de couverture + vérification des 60 % |
| `test:e2e` | `vitest run --config vitest.config.e2e.mts` | tous les tests e2e                                              |

Tu les lances depuis la racine du repo avec le filtre de pnpm :

```bash
pnpm --filter @ft/api test                                   # unit tests
pnpm --filter @ft/api test src/auth/auth.service.spec.ts     # one file
pnpm --filter @ft/api test:cov                               # with coverage
pnpm --filter @ft/api test:e2e                               # e2e (needs Postgres + Redis)
```

Plus haut, les outils appellent les mêmes scripts :

| Où                                        | Cible                        | Lance                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [package.json](../../package.json) racine | `pnpm test`, `pnpm test:cov` | `turbo run test` / `test:cov` dans chaque package                                                                                                                                                 |
| [package.json](../../package.json) racine | `pnpm run ci`                | vérification du format, puis `turbo run lint typecheck test:cov build`                                                                                                                            |
| [turbo.json](../../turbo.json)            | `test`, `test:cov`           | dépendent de `^build` (build `@ft/shared` d'abord) et de `db:generate` (le client Prisma)                                                                                                         |
| [Makefile](../../Makefile)                | `make test`                  | `pnpm run test` (les tests unitaires de tout le workspace)                                                                                                                                        |
| [Makefile](../../Makefile)                | `make ci`                    | crée `.env` (`env-file`), démarre Postgres et Redis (`stores-up`), lance les vérifications de `scripts/`, puis `pnpm run ci`, applique les migrations, puis `pnpm --filter @ft/api run test:e2e`  |
| [Makefile](../../Makefile)                | `make` (= `make all`)        | `make ci`, puis la stack de production sur le tuteur fixture (`make run`), `make monitoring-check`, Playwright, `make llm-spend-check`, puis `make up` de retour sur le provider que nomme `.env` |

Note : `make test-e2e` dans le Makefile est la suite **Playwright** dans le navigateur, pas la suite Supertest de ce
chapitre. La suite Supertest tourne dans `make ci`.

### Ce dont les tests e2e ont besoin

Un test e2e démarre le vrai `AppModule`. `PrismaService` et `RedisService` se connectent quand le module démarre
(chapitre 3), donc **un vrai Postgres et un vrai Redis doivent tourner**, avec les migrations appliquées. La
connexion vient des variables d'environnement :

| Variable         | Utilisée par                         | Qui la fixe                                                                                               |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | `PrismaService`                      | le Makefile la construit à partir des `POSTGRES_*` de `.env` et l'exporte ; la CI la passe à `docker run` |
| `REDIS_URL`      | `RedisService`                       | le Makefile exporte une valeur par défaut ; la CI la passe à `docker run`                                 |
| `SESSION_SECRET` | `configureApp` (signature du cookie) | le Makefile exporte celle de `.env`, sinon une valeur par défaut ; la CI la passe à `docker run`          |

Le Makefile le dit clairement :

```make
# The api Supertest suite boots the whole Nest graph, and both PrismaService and
# RedisService connect on init, so the stores have to exist. The ci workflow gets
# them from `services:` blocks; this is the local equivalent.
stores-up:
	@$(COMPOSE_DEV) up -d --wait db redis >/dev/null
```

### Dans la CI : [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

Le job `unit-tests` (branche de matrice `app: api`) déclare deux **services**, un Postgres (image
`pgvector/pgvector`) et un Redis, avec des health checks. Ensuite il build le stage `ci` de
[apps/api/Dockerfile](../../apps/api/Dockerfile) et lance, à l'intérieur :

```yaml
command: pnpm --filter @ft/api exec prisma migrate deploy && pnpm --filter @ft/api run test:cov && pnpm --filter @ft/api run test:e2e
```

avec `--network host` et `DATABASE_URL=postgresql://ft:ft_local_dev@127.0.0.1:5432/...`,
`REDIS_URL=redis://127.0.0.1:6379`. Le dossier `coverage/` est copié dehors et uploadé comme un artifact nommé
`coverage-api`. (L'autre workflow, [e2e.yml](../../.github/workflows/e2e.yml), est la suite Playwright dans le
navigateur.)

```mermaid
flowchart LR
    PR["Push / pull request"] --> CI["ci.yml : unit-tests (api)"]
    CI --> SVC["services :<br/>Postgres + Redis"]
    CI --> IMG["build du Dockerfile<br/>stage ci"]
    IMG --> MIG["prisma migrate deploy"]
    MIG --> COV["test:cov<br/>tests unitaires + vérif des 60 %"]
    COV --> E2E["test:e2e<br/>suite Supertest"]
    SVC -.-> E2E
    E2E --> ART["upload de coverage/"]
```

---

## 3. Lire une spec unitaire : [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts)

`AuthService` (chapitre 5) inscrit les utilisateurs et vérifie les mots de passe. Il a besoin de `PrismaService`.
Dans un test unitaire, on lui donne un Prisma **mock** à la place.

### Étape 1 : une fabrique de lignes

```ts
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'learner@example.com',
    displayName: 'learner',
    passwordHash: 'replaced in beforeEach',
    avatarUrl: null,
    locale: 'en',
    timeZone: 'UTC',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    // Prisma returns every scalar, so the null columns belong here too: without
    // them an absent field reads as undefined and the 2FA check inverts.
    totpSecret: null,
    totpEnabledAt: null,
    ...overrides,
  };
}
```

Une fonction d'aide qui construit une fausse ligne `User`, avec la forme que Prisma renverrait. `overrides` permet à
un test de changer un champ : `userRow({ passwordHash: 'x' })`. C'est une petite **fixture**.

### Étape 2 : le mock et le module de test

```ts
describe('AuthService', () => {
  const prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
  let service: AuthService;
  let hash: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    hash ??= await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AuthService);
  });
```

- `prisma` est un simple objet avec seulement les deux méthodes qu'appelle `AuthService`, chacune un **mock**
  `vi.fn()`.
- `beforeEach` tourne avant **chaque** `it`. `vi.resetAllMocks()` oublie les réponses et les appels du test
  précédent, donc les tests ne débordent pas les uns sur les autres.
- Le vrai hash argon2 est calculé **une seule fois** (`??=` assigne seulement si `hash` est encore vide), car le
  hachage est lent exprès.
- **`Test.createTestingModule`** (de `@nestjs/testing`) construit un tout petit module Nest, juste pour ce test.
  `{ provide: PrismaService, useValue: prisma }` dit à l'injecteur de Nest : « quand quelqu'un demande
  `PrismaService`, donne-lui cet objet ». Donc `AuthService` reçoit le mock dans son constructeur, exactement comme
  il recevrait le vrai.

```mermaid
flowchart LR
    T["Test.createTestingModule"] --> A["AuthService (vrai)"]
    T --> P["token PrismaService"]
    P -- "useValue" --> M["mock prisma<br/>user.create = vi.fn()<br/>user.findUnique = vi.fn()"]
    A -- "constructor(prisma)" --> M
```

Seulement 4 specs unitaires utilisent `Test.createTestingModule` (auth.service, health.controller, health.service,
llm.module). Les 52 autres appellent juste `new TheService(fakeA, fakeB)` à la main, ce qui est plus simple quand tu
n'as pas besoin que Nest branche quoi que ce soit. Par exemple
[auth.guard.spec.ts](../../apps/api/src/auth/auth.guard.spec.ts) :
`const auth = { findById: vi.fn() } as unknown as AuthService;`.

### Étape 3 : les tests

```ts
    it('stores an argon2id hash, never the password', async () => {
      prisma.user.create.mockResolvedValue(userRow({ passwordHash: 'x' }));

      await service.signUp({ email: 'A@Example.com', displayName: 'learner', password });

      const stored = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(stored).toMatch(/^\$argon2id\$/);
      expect(stored).not.toContain(password);
      await expect(argon2.verify(stored, password)).resolves.toBe(true);
    });
```

- **Arrange** : `mockResolvedValue` fait renvoyer à `create` une promesse d'une ligne d'utilisateur (un stub).
- **Act** : appeler `signUp`.
- **Assert** : `mock.calls[0][0]` est le premier argument du premier appel à `create`. Le test lit le hash que le
  service a essayé d'enregistrer et vérifie que c'est un hash argon2id, qu'il ne contient pas le mot de passe, et
  qu'il correspond vraiment au mot de passe.

```ts
    it('turns the unique-constraint race into a 409', async () => {
      prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        service.signUp({ email: 'a@b.co', displayName: 'learner', password }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
```

`mockRejectedValue` fait **échouer** le mock, comme Postgres quand l'email existe déjà (code d'erreur Prisma
`P2002`). Le test vérifie que le service le transforme en `ConflictException` (HTTP 409). Le test suivant vérifie
qu'une **autre** erreur (`connection lost`) n'est pas cachée. C'est la force des mocks : c'est très difficile de
faire échouer une vraie base de données à la demande.

Les autres groupes (`validateCredentials`, `findById`) suivent le même modèle : même message pour un mauvais mot de
passe et un email inconnu, email insensible à la casse, `null` pour un utilisateur absent.

---

## 4. Lire une spec e2e : [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts)

Son en-tête dit pourquoi c'est un test e2e :

```ts
/**
 * The session behaviour only exists once express-session, connect-redis and the
 * guard run together, so it is proven here rather than in a unit test. Needs a
 * real Postgres and Redis, which CI provides as services.
 */
```

### Étape 1 : démarrer la vraie app

```ts
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });
```

- Cette fois, le module de test importe **tout** `AppModule` : chaque vrai module, aucun mock.
- **`configureApp(app)`** est la même fonction que celle qu'appelle [main.ts](../../apps/api/src/main.ts)
  (chapitre 2). Elle ajoute le préfixe `/api`, le pipe de validation Zod, le filtre d'erreurs, le middleware de
  session avec son store Redis, etc. Comme `main.ts` et les tests la partagent, l'app testée est configurée
  **exactement** comme la vraie. Le code le dit : « Here rather than in bootstrap() so the Supertest suite can reach
  it. » (« Ici plutôt que dans bootstrap() pour que la suite Supertest puisse y accéder. »)
- `app.init()` démarre les modules (Prisma et Redis se connectent) **sans** ouvrir de port réseau.
- `beforeAll` / `afterAll` tournent une fois pour tout le fichier. Le nettoyage supprime l'utilisateur de test.
- L'email contient `Date.now()` (`learner-1732...@example.com`), donc deux lancements n'entrent jamais en conflit.

### Étape 2 : Supertest

**[Supertest](https://github.com/ladjs/supertest)** envoie des requêtes HTTP à un serveur Node : il
lie l'app à un port libre au hasard sur 127.0.0.1, donc le test n'a besoin d'aucun port fixe,
et te laisse vérifier la réponse :

```ts
  const server = () => app.getHttpServer();

  it('signs up, sets an httpOnly session cookie, and never returns the hash', async () => {
    const response = await request(server())
      .post('/api/auth/signup')
      .send({ email, displayName, password })
      .expect(201);

    expect(response.body).toMatchObject({ email, displayName, role: 'USER', timeZone: 'UTC' });
    expect(response.body).not.toHaveProperty('passwordHash');

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain(SESSION_COOKIE);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });
```

`request(server()).post(url).send(body).expect(201)` envoie un POST avec un body JSON et échoue si le statut n'est
pas 201. Ensuite on vérifie le body et le header `Set-Cookie`.

### Étape 3 : un agent garde les cookies

```ts
  it('logs in, serves /me, and drops access after logout', async () => {
    const agent = request.agent(server());

    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.timeZone).toBe('UTC');

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });
```

`request.agent(...)` est comme un petit navigateur : il **garde en mémoire les cookies** entre les requêtes. Donc
après `login`, le `GET /me` suivant porte le cookie de session, et le vrai `AuthGuard`, le vrai store de sessions
Redis et la vraie base de données participent tous.

```mermaid
sequenceDiagram
    participant T as Test (agent supertest)
    participant A as App Nest (configureApp)
    participant R as Redis (sessions)
    participant P as Postgres
    T->>A: POST /api/auth/login
    A->>P: trouve l'utilisateur, vérifie le hash
    A->>R: enregistre la session
    A-->>T: 200 + Set-Cookie ft.sid
    T->>A: GET /api/auth/me (cookie)
    A->>R: charge la session
    A->>P: trouve l'utilisateur
    A-->>T: 200 { email }
    T->>A: POST /api/auth/logout
    A->>R: détruit la session
    A-->>T: 204
    T->>A: GET /api/auth/me
    A-->>T: 401
```

Les autres tests du fichier : un mot de passe faible donne 400 (règles Zod partagées), un email en double 409, `/me`
sans session 401, le **même** message 401 pour un mauvais mot de passe et un email inconnu (pour que personne ne
puisse deviner quels emails existent), un **nouvel id de session** après le login (protection contre la « session
fixation »), et `/api/health` toujours public.

### Les modèles e2e courants que tu vas voir

- **Un vrai port quand il faut des sockets** : `await app.listen(0, '127.0.0.1')` (port 0 = « n'importe quel port
  libre ») dans les specs friends, gateway et messages, pour qu'un `socket.io-client` puisse se connecter.
- **Une horloge figée** : `vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })` et
  `vi.setSystemTime(NOON)` dans les specs lessons, attempts, finish et gamification. Seul `Date` est simulé, donc
  Postgres et Redis marchent encore ; le commentaire dans
  [lessons.e2e-spec.ts](../../apps/api/test/lessons.e2e-spec.ts) explique que ça empêche un lancement qui passe
  minuit UTC de voir deux jours différents.
- **Une adresse par agent** : l'inscription et le login sont limités par IP, donc
  [gateway.e2e-spec.ts](../../apps/api/test/gateway.e2e-spec.ts) donne à chaque agent son propre
  `X-Forwarded-For: 192.0.2.N`.
- **Des ids de test** : les leçons fixtures utilisent des ids comme `fr-test-...`, que le seed sait ignorer.

---

## 5. Chaque spec e2e et chaque fixture dans [apps/api/test](../../apps/api/test)

```
apps/api/test/
├── *.e2e-spec.ts          19 spec files (run by test:e2e)
├── attempts.fixtures.ts   play a lesson attempt through the routes
├── gemini.fixtures.ts     Google's 429 bodies, the day's and the minute's
├── metrics.fixtures.ts    read one Prometheus series
├── placement.fixtures.ts  exam run, bank rows, fakeRedis, bankPrisma
├── socket.fixtures.ts     open and listen to a socket.io client
└── fixtures/
    ├── seed-valid/        one good item file
    ├── seed-invalid/      one broken item file
    └── seed-duplicate/    two files sharing one sourceId
```

### Les specs e2e

| Fichier                                                                  | Ce qu'il vérifie                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [app.e2e-spec.ts](../../apps/api/test/app.e2e-spec.ts)                   | `GET /api/health` répond avec la forme que publie `@ft/shared` ; le document OpenAPI (Swagger) est servi sur `/api/docs`.                                                                                                                                                                                                                                                                                                                     |
| [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts)                 | Inscription, options du cookie, 409 pour un doublon, même 401 pour un mauvais mot de passe et un email inconnu, login / `/me` / logout, nouvel id de session au login (section 4).                                                                                                                                                                                                                                                            |
| [two-factor.e2e-spec.ts](../../apps/api/test/two-factor.e2e-spec.ts)     | Activation de la 2FA avec un vrai code TOTP, login qui s'arrête à 202 avec une demi-session, second facteur, code de récupération utilisé une seule fois, setup/enable refusés quand elle est active (#216), la désactivation demande le mot de passe.                                                                                                                                                                                        |
| [users.e2e-spec.ts](../../apps/api/test/users.e2e-spec.ts)               | Upload d'avatar (chemin relatif, servi en retour, ancien fichier supprimé, mauvais type / faux octets / trop gros refusés avec des codes), fuseau horaire enregistré ou refusé, les champs du profil public.                                                                                                                                                                                                                                  |
| [courses.e2e-spec.ts](../../apps/api/test/courses.e2e-spec.ts)           | Aller-retour d'un cours (créer, lister, objectif, niveau, langue active), les règles (pas de second cours, pas de cours implicite, objectif / langue / niveau valides), personne ne voit les cours d'un autre utilisateur.                                                                                                                                                                                                                    |
| [placement.e2e-spec.ts](../../apps/api/test/placement.e2e-spec.ts)       | Les routes de l'examen de placement avec ses propres lignes en allemand : départ en B1, même question au rechargement, un seul passage à la fois, répondre, abandonner, aller jusqu'à un résultat qui place le cours, passage où tout expire, utilisateurs séparés.                                                                                                                                                                           |
| [lessons.e2e-spec.ts](../../apps/api/test/lessons.e2e-spec.ts)           | Les trois lectures de leçons (`today`, liste `lessons` avec recherche / filtre / tri / groupe / pages, une leçon) : avant le placement, en A1, après un passage en A2, streaks, autres utilisateurs, Swagger.                                                                                                                                                                                                                                 |
| [attempts.e2e-spec.ts](../../apps/api/test/attempts.e2e-spec.ts)         | La tentative de leçon (#145) : démarrage (une seule tentative pour deux démarrages parallèles), pages d'entraînement et cursors périmés, le chrono de l'examen avec ses 2 s de marge, fermeture une seule fois, reprises, tentatives supprimées quand un nouveau seed change la leçon.                                                                                                                                                        |
| [finish.e2e-spec.ts](../../apps/api/test/finish.e2e-spec.ts)             | Finir des leçons par les routes de tentative : qui peut jouer, première fin, meilleur score gardé, objectif atteint à la troisième leçon et la streak, une seule validation pour deux fins parallèles, changements d'objectif, changements de niveau.                                                                                                                                                                                         |
| [gamification.e2e-spec.ts](../../apps/api/test/gamification.e2e-spec.ts) | XP, le défi du jour et les succès (#95) : nombres d'XP exacts, défi donné une seule fois, GOAL_XP, streak7, levelA1, la route des succès, Swagger.                                                                                                                                                                                                                                                                                            |
| [discussion.e2e-spec.ts](../../apps/api/test/discussion.e2e-spec.ts)     | Le stream du tuteur IA avec le provider fixture : vérifications avant le stream (session, cours, tentative périmée), événements `delta` puis `done`, erreurs d'entraînement dans le prompt, codes d'erreur (`llm.quotaExhausted` pour le `#quota-day` de la fixture et pour un `429` du jour), annulation quand l'apprenant part, les limites par minute et par jour.                                                                         |
| [tutor.e2e-spec.ts](../../apps/api/test/tutor.e2e-spec.ts)               | Le test de la clé du tuteur (`GET /api/tutor`, `POST /api/tutor/check`) sur la fixture, avec un stub du `check` du provider : 401 sans session, le provider de la fixture et pas de modèle, 200 pour chaque statut, `quota_day` compris, avec `retryAt` sur un 429 (et `unexpected` quand le provider lance une erreur), un test partagé par deux comptes, les deux routes dans Swagger sous le tag `tutor`, le 429 après 3 tests par minute. |
| [friends.e2e-spec.ts](../../apps/api/test/friends.e2e-spec.ts)           | Recherche d'utilisateurs, « récemment actifs », le flux demande / accepter / retirer entendu sur de vrais sockets, événements en ligne pour les amis seulement, le nombre de demandes en attente (route, envois, à la connexion avant `dm:unread`), demandes croisées, suppression de compte, 10 demandes par minute.                                                                                                                         |
| [messages.e2e-spec.ts](../../apps/api/test/messages.e2e-spec.ts)         | Pagination de l'historique des messages, qui peut envoyer, `dm:send` et `dm:read` sur de vrais sockets, nombres de non-lus, liste des conversations, acks pour les événements refusés, le budget par minute, retrait d'un ami.                                                                                                                                                                                                                |
| [gateway.e2e-spec.ts](../../apps/api/test/gateway.e2e-spec.ts)           | Le handshake du socket (session, cookie falsifié, origine, sockets par session), sockets fermés quand la session se termine (logout, nouveau login, expiration, changement de 2FA), événements `course:updated`, événements inconnus et limites anti-flood.                                                                                                                                                                                   |
| [error-codes.e2e-spec.ts](../../apps/api/test/error-codes.e2e-spec.ts)   | Chaque `message` d'erreur est une entrée de `ERROR_CODES` (#108) : codes Zod, `:lang` inconnu, pas de session, body JSON mauvais ou énorme, route inconnue, un crash, limites de débit sur le login et l'inscription.                                                                                                                                                                                                                         |
| [metrics.e2e-spec.ts](../../apps/api/test/metrics.e2e-spec.ts)           | Les métriques HTTP à travers le vrai pipeline Express : modèle de route (jamais l'URL), chemins sans correspondance, pas de `/api/metrics`, jauges de la banque et des comptes au moment du scrape.                                                                                                                                                                                                                                           |
| [seed.e2e-spec.ts](../../apps/api/test/seed.e2e-spec.ts)                 | Le seed (chapitre 4) sur un vrai Postgres : `seedQuestionBank` (chargement, idempotent, la mise à jour garde l'id, échoue sur des fichiers mauvais ou en double, les 270 vrais items) et `seedLessons` (correspondance avec l'outline, pas de réécriture, ids gardés, Restrict, flags ready, leçons invalides refusées) ; `demoSkipReason` et `demoPassword`.                                                                                 |
| [demo.e2e-spec.ts](../../apps/api/test/demo.e2e-spec.ts)                 | Le rejeu des apprenants de démo (#85) pour anna, ben, chloe, david et eva sous des identités de test, le français A1 complété jusqu'à 12 leçons prêtes : streaks, changements d'objectif, fins et cartes du jour, niveaux terminés ou non, succès, une fin juste après minuit heure locale à Tokyo ; un apprenant qui échoue, sauté et nettoyé ; les amitiés, la demande et les messages non lus de `seedDemoSocial`.                         |

### Les fixtures

| Fichier / dossier                                                       | Ce qu'il donne                                                                                                                                                                                                                                                                                                                                      | Utilisé par                                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [attempts.fixtures.ts](../../apps/api/test/attempts.fixtures.ts)        | `shortLesson(id, position, level, lang)` : une ligne de leçon prête construite sur le court brief de vocabulaire de `@ft/shared`. `openAttempt` : démarre une tentative et reconstruit le plan et les refs des réponses comme le fait le serveur. `playToLast`, `playLesson` : jouent chaque page juste ou vide.                                    | specs e2e attempts, finish, gamification, discussion, gateway                                                                                                 |
| [gemini.fixtures.ts](../../apps/api/test/gemini.fixtures.ts)            | `DAY_QUOTA_BODY` : le `429` qu'une clé gratuite a reçu le 2026-11-27 une fois ses requêtes du jour dépensées (quota `PerDay`, `retryDelay` `"48933s"`) ; `MINUTE_QUOTA_BODY` : le même pour le quota de la minute (`"21s"`).                                                                                                                        | les trois specs unitaires llm/gemini                                                                                                                          |
| [metrics.fixtures.ts](../../apps/api/test/metrics.fixtures.ts)          | `seriesValue(metric, labels, suffix)` : la valeur d'une série Prometheus, ou `undefined` si elle n'existe pas.                                                                                                                                                                                                                                      | beaucoup de specs unitaires (metrics, gateway, llm/gemini, tutor, placement, question-stock) et les specs e2e metrics, attempts, friends, messages et gateway |
| [placement.fixtures.ts](../../apps/api/test/placement.fixtures.ts)      | `examSession()` (un passage tel qu'il commence), `questionRow()` (une ligne de la banque en allemand B1), `placementBank()` (3 lignes par niveau et catégorie), `wrongChoice()`, `fakeRedis()` (un Redis en mémoire avec `set NX`, hashes, listes, `multi`, le script de libération du verrou), `bankPrisma(rows)` (un faux Prisma pour la banque). | les quatre specs unitaires de placement, placement e2e                                                                                                        |
| [socket.fixtures.ts](../../apps/api/test/socket.fixtures.ts)            | `sessionCookie(res)`, `connect(port, cookie)` (client websocket seulement sur `/ws`), `nextEvent`, `connected`, `ready` (attend `dm:unread`), `refusal`, `collect`.                                                                                                                                                                                 | specs e2e gateway, friends, messages                                                                                                                          |
| [fixtures/seed-valid/](../../apps/api/test/fixtures/seed-valid)         | `en-grammar.json` avec un item correct (`en-gram-9001`).                                                                                                                                                                                                                                                                                            | seed e2e : charge et relie chaque colonne                                                                                                                     |
| [fixtures/seed-invalid/](../../apps/api/test/fixtures/seed-invalid)     | `en-grammar.json` dont l'item n'a que 3 options.                                                                                                                                                                                                                                                                                                    | seed e2e : doit échouer bruyamment, en nommant le fichier et la raison                                                                                        |
| [fixtures/seed-duplicate/](../../apps/api/test/fixtures/seed-duplicate) | `en-grammar-a.json` et `en-grammar-b.json`, les deux avec le `sourceId` `en-gram-9002`.                                                                                                                                                                                                                                                             | seed e2e : doit échouer avant d'écrire quoi que ce soit                                                                                                       |

Note : les fichiers `.fixtures.ts` vivent dans `test/` mais certaines specs **unitaires** les importent aussi (par
exemple `fakeRedis` dans les specs de placement). Ils ne finissent ni par `.e2e-spec.ts` ni par `.spec.ts`, donc
aucune des deux configs ne les lance comme tests.

---

## 6. Chaque spec unitaire dans [apps/api/src](../../apps/api/src)

56 fichiers. Chacun est à côté du fichier qu'il teste (`x.service.ts` → `x.service.spec.ts`).

### auth (chapitre 5)

| Spec                                                                             | Ce qu'elle vérifie                                                                                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [auth.controller.spec.ts](../../apps/api/src/auth/auth.controller.spec.ts)       | Le logout efface le cookie et ferme les sockets de la session ; chaque nouvel id de session (inscription, login, étapes de la 2FA) ferme celui qu'il remplace. |
| [auth.guard.spec.ts](../../apps/api/src/auth/auth.guard.spec.ts)                 | Les routes `@Public` passent ; pas de session → 401 ; attache l'utilisateur et le compte comme actif ; détruit une session dont l'utilisateur n'existe plus.   |
| [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts)             | Hash argon2id, email en minuscules, pas de hash renvoyé, P2002 → 409, vérification des identifiants (section 3).                                               |
| [two-factor.service.spec.ts](../../apps/api/src/auth/two-factor.service.spec.ts) | Activation (setup, confirmation, refus quand elle est active, courses entre requêtes), le second facteur avec les codes TOTP et les codes de récupération.     |

### users (chapitre 5)

| Spec                                                                    | Ce qu'elle vérifie                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [users.service.spec.ts](../../apps/api/src/users/users.service.spec.ts) | Chemins d'avatar et suppression de fichiers (jamais en dehors du dossier de stockage), la recherche échappe les jokers, récemment actifs sur 7 jours UTC, conflits de profil, streak sur le jour du propriétaire. |
| [active-day.spec.ts](../../apps/api/src/users/active-day.spec.ts)       | `activeDay` garde le jour UTC ; `activeSince` recule de 6 jours.                                                                                                                                                  |

### Infrastructure : prisma, redis, throttler, metrics, health (chapitre 3)

| Spec                                                                                              | Ce qu'elle vérifie                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [prisma.service.spec.ts](../../apps/api/src/prisma/prisma.service.spec.ts)                        | Se connecte au bootstrap avec un `SELECT 1`, fait échouer le démarrage contre un port fermé (sans mock), se déconnecte à l'arrêt, latence du `ping`, refuse un `DATABASE_URL` vide.                              |
| [redis.service.spec.ts](../../apps/api/src/redis/redis.service.spec.ts)                           | Se connecte à l'init, fait échouer le démarrage contre un port fermé (sans mock), abandonne avant la première connexion et attend de plus en plus après, se ferme à l'arrêt, `ping`, refuse un `REDIS_URL` vide. |
| [identity-throttler.guard.spec.ts](../../apps/api/src/throttler/identity-throttler.guard.spec.ts) | Identifie un appelant connecté par l'utilisateur, un anonyme par l'IP ; les routes `@ThrottleByIp` ; les limites par route et le plafond par défaut.                                                             |
| [rate-limits.spec.ts](../../apps/api/src/throttler/rate-limits.spec.ts)                           | `readLimit` : valeur par défaut quand rien n'est fixé, entier positif, erreur qui nomme la variable.                                                                                                             |
| [throttler-storage.spec.ts](../../apps/api/src/throttler/throttler-storage.spec.ts)               | Les compteurs d'inscription expirent tout seuls, même après le blocage d'une autre route.                                                                                                                        |
| [http-metrics.middleware.spec.ts](../../apps/api/src/metrics/http-metrics.middleware.spec.ts)     | Mesure le temps de chaque requête sous son modèle de route, 499 pour un client parti, « unmatched », compté une seule fois ; `routeOf`, `methodOf`.                                                              |
| [metrics-server.spec.ts](../../apps/api/src/metrics/metrics-server.spec.ts)                       | `GET /metrics` au format Prometheus, les autres chemins, 500 sur un registre cassé, port déjà pris.                                                                                                              |
| [metrics.collector.spec.ts](../../apps/api/src/metrics/metrics.collector.spec.ts)                 | Jauges de la banque et des comptes, au plus une requête par minute, garde les anciennes valeurs en cas d'échec, réponse en 3 s quand la base de données bloque.                                                  |
| [metrics.spec.ts](../../apps/api/src/metrics/metrics.spec.ts)                                     | Les séries que lisent les alertes existent à 0 dès le départ ; utilisateurs actifs sur 5 minutes.                                                                                                                |
| [health.controller.spec.ts](../../apps/api/src/health/health.controller.spec.ts)                  | Le payload correspond au contrat publié.                                                                                                                                                                         |
| [health.service.spec.ts](../../apps/api/src/health/health.service.spec.ts)                        | Version, uptime, ok / degraded / down selon les sondes Postgres et Redis.                                                                                                                                        |

### llm (chapitre 6)

| Spec                                                                                    | Ce qu'elle vérifie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [disabled.provider.spec.ts](../../apps/api/src/llm/disabled.provider.spec.ts)           | N'écrit aucune question ; le stream de la discussion échoue avant son premier morceau.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [fixture.provider.spec.ts](../../apps/api/src/llm/fixture.provider.spec.ts)             | Refuse les demandes de questions ; `streamText` envoie une réponse fixe et simule des streams bloqués, en timeout, coupés et annulés, et le quota du jour (`#quota-day`).                                                                                                                                                                                                                                                                                                                                                                                                     |
| [gemini.provider.spec.ts](../../apps/api/src/llm/gemini.provider.spec.ts)               | La requête (schéma, clé dans un header), timeout de 90 s, parsing, logs, quels échecs sont réessayés et lesquels non (un `429` du jour ne l'est pas), `quotaRefusal` sur les bodies de `429` de Google, métriques.                                                                                                                                                                                                                                                                                                                                                            |
| [gemini.provider.stream.spec.ts](../../apps/api/src/llm/gemini.provider.stream.spec.ts) | `streamText` en SSE : événements coupés entre plusieurs paquets, raisons de fin, streams cassés, un `429` du jour, l'apprenant qui part, métriques.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [gemini.provider.check.spec.ts](../../apps/api/src/llm/gemini.provider.check.spec.ts)   | `check` : un `POST` d'un mot vers `:generateContent` avec le réglage de réflexion du tuteur, la clé dans un header et jamais dans l'URL, timeout de 30 s, le statut de chaque réponse (avec le vrai body `API_KEY_INVALID`, un `200` qui n'est pas une réponse de Gemini lu `unexpected`, et `quota` ou `quota_day` avec `retryAt` pour les deux bodies de `429`), pas de réponse ou le timeout donne `unreachable` au lieu d'une erreur lancée, le body de Google dans le log en cas d'échec mais jamais la clé, rien de compté dans les métriques des vrais appels, `info`. |
| [llm.factory.spec.ts](../../apps/api/src/llm/llm.factory.spec.ts)                       | `createLlmProvider` choisit fixture / disabled / Gemini, modèle par défaut, refuse une clé manquante ou un nom inconnu.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [llm.module.spec.ts](../../apps/api/src/llm/llm.module.spec.ts)                         | Le module construit le provider que nomme `LLM_PROVIDER`, ou le fixture par défaut.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### tutor (chapitre 6)

| Spec                                                                    | Ce qu'elle vérifie                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tutor.service.spec.ts](../../apps/api/src/tutor/tutor.service.spec.ts) | `info` ; la réponse construite avec exactement les champs connus ; un test réutilisé pendant 15 s et partagé pendant qu'il tourne, un nouveau à chaque fois avec `reuseMs` à 0 ; `unexpected` quand le test rejette sa promesse ; `retryAt` transmis ; `ft_llm_checks_total` démarre à 0 et ne compte que les nouveaux tests. |

### courses, placement, question-generation (chapitre 7)

| Spec                                                                                                          | Ce qu'elle vérifie                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [courses.service.spec.ts](../../apps/api/src/courses/courses.service.spec.ts)                                 | Liste à travers l'utilisateur, création sans niveau, `setGoal` (verrou, streak, GOAL_XP, événement socket après le commit), `setLevel` (clé composée, not-found). |
| [placement.service.spec.ts](../../apps/api/src/placement/placement.service.spec.ts)                           | Démarrage, rechargement, envoi (timeouts, verrou), abandon, métriques, placement du cours à la fin.                                                               |
| [placement-question.service.spec.ts](../../apps/api/src/placement/placement-question.service.spec.ts)         | Tirer une question pas encore vue, repli sur des lignes générées ou déjà vues, réserve épuisée, la question envoyée sans sa réponse, métriques.                   |
| [placement-session.service.spec.ts](../../apps/api/src/placement/placement-session.service.spec.ts)           | Le verrou Redis (un seul appelant, token, réessais) et le passage enregistré (expiration, en cours ou non, anciens formats). Utilise `fakeRedis`.                 |
| [placement-progress.service.spec.ts](../../apps/api/src/placement/placement-progress.service.spec.ts)         | Faire bouger le niveau après chaque réponse, les temps écoulés, le résultat final.                                                                                |
| [question-batch.prompt.spec.ts](../../apps/api/src/question-generation/prompts/question-batch.prompt.spec.ts) | Le prompt demande les bonnes questions par catégorie et par sujet.                                                                                                |
| [question-batch.spec.ts](../../apps/api/src/question-generation/question-batch.spec.ts)                       | `freshItems` enlève les doublons ; `toRows` range les items dans leur case avec la bonne limite de temps.                                                         |
| [question-stock.service.spec.ts](../../apps/api/src/question-generation/question-stock.service.spec.ts)       | Quand une case est réapprovisionnée, un seul réapprovisionnement à la fois, 10 min de pause, réessais, ne rejette jamais, métriques.                              |

### lessons (chapitre 8)

| Spec                                                                                      | Ce qu'elle vérifie                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [attempt-ref.spec.ts](../../apps/api/src/lessons/attempt-ref.spec.ts)                     | `refOf` donne des refs stables qui dépendent du secret.                                                                                                                                 |
| [course-lookup.spec.ts](../../apps/api/src/lessons/course-lookup.spec.ts)                 | `checkCourse` (404 / 409) et `findLesson` (404, mauvais ids).                                                                                                                           |
| [discussion.controller.spec.ts](../../apps/api/src/lessons/discussion.controller.spec.ts) | `errorCode` : le code de chaque raison d'échec, `llm.quotaExhausted` pour un `429` du jour, `unknown` pour un bug.                                                                      |
| [discussion-limits.spec.ts](../../apps/api/src/lessons/discussion-limits.spec.ts)         | Valeurs par défaut et mauvaises valeurs de `readDiscussionLimits`.                                                                                                                      |
| [discussion-prompt.spec.ts](../../apps/api/src/lessons/discussion-prompt.spec.ts)         | Le prompt système du tuteur : pas de document d'examen, faits qui enseignent en JSON, erreurs d'entraînement (jamais les réponses de l'examen, au plus `MAX_MISTAKES`).                 |
| [event-stream.spec.ts](../../apps/api/src/lessons/event-stream.spec.ts)                   | Headers SSE, format des événements, heartbeat de 15 s, annulation quand le navigateur part.                                                                                             |
| [gamification.rules.spec.ts](../../apps/api/src/lessons/gamification.rules.spec.ts)       | XP par fin, rangs, le hash du défi du jour, `challengeMet`, succès gagnés, barres de progression.                                                                                       |
| [goal.spec.ts](../../apps/api/src/lessons/goal.spec.ts)                                   | `lockCourse` (FOR UPDATE), `meetGoal` (streak écrite une seule fois), `latestDay`.                                                                                                      |
| [roadmap.rules.spec.ts](../../apps/api/src/lessons/roadmap.rules.spec.ts)                 | Le plan du jour : statut, fusion des résultats, ordre de la file, `plan`, progression du niveau, jours locaux, streaks, un parcours complet du premier jour.                            |
| [lesson-search.spec.ts](../../apps/api/src/lessons/lesson-search.spec.ts)                 | Recherche (accents, ae/oe/ue en allemand, chaque mot), filtres, tri, groupe, pages.                                                                                                     |
| [outline-files.spec.ts](../../apps/api/src/lessons/outline-files.spec.ts)                 | Chaque fichier de `content/outlines` : schéma, nom, nombre d'entrées par type, pas d'id `-test-`, pas d'id ni de titre en double.                                                       |
| [lesson-files.spec.ts](../../apps/api/src/lessons/lesson-files.spec.ts)                   | Chaque fichier de `content/briefs` et `content/lessons` : a une entrée dans l'outline, passe `validateLesson`, pas de contenu orphelin, pas de titre en double, le français utilise tu. |
| [lesson-complete.spec.ts](../../apps/api/src/lessons/lesson-complete.spec.ts)             | L'étape `complete` de `scripts/lessons` (chapitre 11).                                                                                                                                  |
| [lesson-edits.spec.ts](../../apps/api/src/lessons/lesson-edits.spec.ts)                   | Les modifications, le parsing des réponses et la gestion des refus de `scripts/lessons` (chapitre 11).                                                                                  |

### items

| Spec                                                              | Ce qu'elle vérifie                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [item-files.spec.ts](../../apps/api/src/items/item-files.spec.ts) | Chaque fichier de `content/items` (questions de placement) : schéma, nom de fichier, pas d'id partagé, catégories manquantes signalées (chapitre 11). |

### gateway, presence, friends, messages, demo (chapitre 9)

| Spec                                                                                          | Ce qu'elle vérifie                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [socket.gateway.spec.ts](../../apps/api/src/gateway/socket.gateway.spec.ts)                   | `sameOrigin`, `fixedWindow`, le handshake, le tri et les limites des événements, acks, présence, demandes en attente et non-lus à la connexion, fermeture des sessions terminées.                                                                                                     |
| [sockets.service.spec.ts](../../apps/api/src/gateway/sockets.service.spec.ts)                 | Émet seulement vers la room de l'utilisateur ; ferme les sockets d'une session.                                                                                                                                                                                                       |
| [socket-exception.filter.spec.ts](../../apps/api/src/gateway/socket-exception.filter.spec.ts) | Les codes d'erreur vont dans l'ack, ou dans `app:error` quand il n'y a pas d'ack.                                                                                                                                                                                                     |
| [presence.service.spec.ts](../../apps/api/src/presence/presence.service.spec.ts)              | En ligne au premier socket, hors ligne après le délai de grâce, compteurs gardés par utilisateur, remise à zéro au démarrage.                                                                                                                                                         |
| [friends.service.spec.ts](../../apps/api/src/friends/friends.service.spec.ts)                 | `pairKey`, envoi de demandes (à soi-même, demandes croisées, 404), écritures qui ne trouvent rien, qui reçoit `friend:pending` après chaque écriture, la liste avec les indicateurs en ligne.                                                                                         |
| [messages.service.spec.ts](../../apps/api/src/messages/messages.service.spec.ts)              | Envoi (une seule transaction, les deux rooms prévenues, budget), lecture, pagination avec un cursor, liste des conversations.                                                                                                                                                         |
| [unread.spec.ts](../../apps/api/src/messages/unread.spec.ts)                                  | `unreadCounts` par conversation.                                                                                                                                                                                                                                                      |
| [demo.planner.spec.ts](../../apps/api/src/demo/demo.planner.spec.ts)                          | `atLocalTime`, `daysBefore`, `pastScore`, `planCourse` avec ses changements d'objectif, `daysToAttemptAll`, les six profils de démo et les adresses exactes que le seed supprime, le français A1 de `content/` qui a `SMALLEST_LEVEL` leçons prêtes, les amitiés et messages de démo. |

Trois de ces specs lisent de **vrais fichiers**, pas du code : `outline-files`, `lesson-files` et `item-files`. Le
commentaire dans `item-files.spec.ts` dit pourquoi ce sont des tests et pas des scripts : « it runs in `make`, in
`pnpm test` and in CI with no extra wiring, and it fails for the person who wrote the item instead of for whoever
runs the seed a week later. » (« il tourne dans `make`, dans `pnpm test` et dans la CI sans rien brancher de plus,
et il échoue pour la personne qui a écrit l'item au lieu de celui qui lance le seed une semaine plus tard. »)

---

## 7. Le dossier `coverage/`

`pnpm --filter @ft/api test:cov` écrit `apps/api/coverage/`. Il est **généré** et listé
dans `.gitignore`, donc il n'est jamais commité.

```
apps/api/coverage/
├── lcov.info        machine-readable list of covered lines (for tools and CI)
└── lcov-report/     a small website: open index.html in a browser
    ├── index.html   one row per folder, with % of lines / functions / branches
    └── ...          one page per file, uncovered lines in red
```

Ils viennent de `reporter: ['text', 'lcov']` dans la config unitaire : `text` est le tableau affiché dans le
terminal, `lcov` produit ces deux sorties. Dans la CI, le dossier est uploadé comme l'artifact `coverage-api` (gardé
7 jours). Si la couverture descend sous 60 % des lignes ou 60 % des fonctions, `test:cov` sort avec une erreur et la
CI échoue. Seuls les tests unitaires comptent : le lancement e2e n'a pas de couverture.

---

## Idées clés à retenir

- Un **test unitaire** vérifie une pièce avec des doublures autour ; un **test e2e** vérifie toute l'app avec un
  vrai Postgres et un vrai Redis.
- Ce projet utilise **Vitest**, avec deux configs : `vitest.config.mts` (`src/**/*.spec.ts`) et
  `vitest.config.e2e.mts` (`test/**/*.e2e-spec.ts`).
- Le plugin **swc** est le seul transformateur (Oxc est désactivé, donc un seul outil écrit les métadonnées des
  décorateurs) ; sans ces métadonnées, Nest ne peut rien injecter.
- Les mocks sont des `vi.fn()` ; la plupart des specs construisent le service **à la main** avec `new`, quelques-unes
  utilisent `Test.createTestingModule` avec `{ provide, useValue }`.
- Les specs e2e démarrent `AppModule`, appellent le **même `configureApp`** que `main.ts`, et lui parlent avec
  **Supertest** (`request.agent` garde les cookies).
- Les e2e tournent **un fichier à la fois**, avec le LLM **fixture** et les limites de débit par défaut.
- `make ci` et la CI démarrent Postgres et Redis, lancent les migrations, puis `test:cov` et `test:e2e`.
- La couverture doit rester à **60 % des lignes et des fonctions** ; le rapport est dans `coverage/`.

---

Précédent : [Chapitre 9 — Social et temps réel](09-social-and-realtime.md) · Suivant : [Chapitre 11 — Le dossier scripts](11-scripts.md) · [Retour au sommaire](README.md)
