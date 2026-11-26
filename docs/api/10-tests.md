# Chapter 10 — Tests: unit and end-to-end

In this chapter:

- What a test is, and the main kinds: unit, integration, end-to-end (e2e)
- Mocks, fakes and stubs: the stand-ins a test uses instead of the real thing
- The test pyramid and code coverage
- How tests run **here**: Vitest (not Jest), the two config files, the commands, CI
- One unit spec read line by line: [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts)
- One e2e spec read line by line: [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts)
- A table of every e2e spec and fixture in [apps/api/test](../../apps/api/test)
- A table of every unit spec (`*.spec.ts`) in [apps/api/src](../../apps/api/src), by module
- The `coverage/` folder

---

## 1. Theory: what is a test?

A **test** is a small program that runs your real code and checks the result. If the result
is not what you expect, the test **fails** and prints why. You write it once, and then the
computer checks the same thing again on every change, in seconds.

Each test has the same three parts (often called *Arrange, Act, Assert*):

1. **Arrange**: prepare the inputs and the world around the code.
2. **Act**: call the code.
3. **Assert**: check the result with `expect(...)`.

### The car analogy

Think of a car factory.

| Kind of test | In the car factory | In this API |
| --- | --- | --- |
| **Unit test** | Put one part (the brakes) on a bench and test it alone. The rest of the car is replaced by a test machine. | Test one class or one function (for example `AuthService`) with the database replaced by a fake. |
| **Integration test** | Fit the brakes to the wheels and check they work together. | Test a few real pieces together (for example a service with a real Redis). |
| **End-to-end (e2e) test** | Drive the whole car on a real road. | Start the whole Nest app, send real HTTP requests, use a real Postgres and a real Redis. |

A unit test is **fast** and tells you **exactly** which part is broken. An e2e test is
**slow**, but it proves that all the parts really work **together** (the guard, the pipe,
the session cookie, the database...). Both are needed.

### Mocks, fakes and stubs

In a unit test we do not want a real database. We put a **stand-in** in its place. There are
three common names (people often mix them up, and that is fine):

| Name | What it is | Example here |
| --- | --- | --- |
| **Stub** | Returns a fixed answer, nothing more. | `prisma.user.findUnique.mockResolvedValue(null)`: "the user does not exist". |
| **Mock** | A stub that also **records** how it was called, so the test can check the calls. | `vi.fn()` from Vitest: `expect(prisma.user.create.mock.calls[0][0].data.email).toBe(...)`. |
| **Fake** | A small working version of the real thing, kept in memory. | `fakeRedis()` in [placement.fixtures.ts](../../apps/api/test/placement.fixtures.ts): a tiny Redis made of a `Map`. |

A **fixture** is prepared test data (a JSON file, a user row, a helper that builds one).

### The test pyramid

```mermaid
flowchart TB
    E2E["e2e tests<br/>18 files in test/<br/>slow, real Postgres + Redis"]
    UNIT["unit tests<br/>53 files *.spec.ts in src/<br/>fast, no database"]
    E2E --- UNIT
    style E2E fill:#f6d5a8,stroke:#a0522d
    style UNIT fill:#bfe3c0,stroke:#2e7d32
```

The idea: **many** fast unit tests at the bottom, **fewer** slow e2e tests on top. The
browser tests (Playwright, in the root [e2e/](../../e2e) folder) sit even higher; they belong
to the web app and the whole stack, not to this chapter.

### Coverage

**Code coverage** measures which lines of your code the tests ran. 80% line coverage means
80% of the lines were executed at least once during the tests. It does **not** prove the code
is correct (a line can run without being checked), but a low number shows code that no test
touches at all. Here, the unit tests must cover at least **60% of lines and 60% of functions**,
or the command fails.

---

## 2. How tests run here

### Vitest, not Jest

Many NestJS tutorials use **Jest**. This project uses **[Vitest](https://vitest.dev)**, a test
runner with almost the same API (`describe`, `it`, `expect`, `beforeEach`) but built on Vite.
There is **no `jest` key** in [package.json](../../apps/api/package.json) and no
`jest-e2e.json`. Instead there are two config files:

| File | Runs | Files it picks |
| --- | --- | --- |
| [vitest.config.mts](../../apps/api/vitest.config.mts) | unit tests | `src/**/*.spec.ts` |
| [vitest.config.e2e.mts](../../apps/api/vitest.config.e2e.mts) | e2e tests | `test/**/*.e2e-spec.ts` |

In a test file, everything comes from `vitest`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

`vi` is Vitest's toolbox: `vi.fn()` makes a mock function, `vi.useFakeTimers()` freezes the
clock, `vi.resetAllMocks()` clears every mock.

### The unit config: [vitest.config.mts](../../apps/api/vitest.config.mts)

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

What each part does:

- **`swc.vite(...)`**: Vitest must turn TypeScript into JavaScript. Nest's dependency
  injection (chapter 1) reads the **types of constructor parameters** from hidden "metadata"
  that only some compilers write. `swc` writes it. Vite 8's default transformer, `oxc`, can
  write it too, but it is turned off with `oxc: false` so swc is the only transformer and the
  metadata never depends on which of the two ran first. Without this, every test that asks
  Nest for a provider fails with "Nest can't resolve dependencies".
- **`include`**: only files under `src/` ending in `.spec.ts`.
- **`setupFiles: ['reflect-metadata']`**: loads the small library that stores that metadata,
  before any test.
- **`env`**: sets `AVATAR_STORAGE_DIR`, because [app.setup.ts](../../apps/api/src/app.setup.ts)
  refuses to load without it.

The same file holds the coverage rules:

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

`v8` is the coverage engine built into Node. `text` prints a table in the terminal, `lcov`
writes the files of the `coverage/` folder (section 7). Module files and `main.ts` are left
out: they only wire things together, and the e2e tests run them.

### The e2e config: [vitest.config.e2e.mts](../../apps/api/vitest.config.e2e.mts)

It repeats the swc plugin (the comment explains it does not import the unit config, because
merging would run every unit spec a second time), then:

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

Three things to notice:

- **`LLM_PROVIDER: 'fixture'`** and an empty key: the tests never call a real AI model and
  never spend money (chapter 6 explains the fixture provider).
- **Long timeouts** (30 s): booting the whole app takes time.
- **`fileParallelism: false`**: the e2e files run **one after the other**, because they share
  one database.

### The commands

From [apps/api/package.json](../../apps/api/package.json):

| Script | Command | What it does |
| --- | --- | --- |
| `test` | `vitest run` | all unit tests, once |
| `test:cov` | `vitest run --coverage` | unit tests + coverage report + 60% check |
| `test:e2e` | `vitest run --config vitest.config.e2e.mts` | all e2e tests |

You run them from the repo root with pnpm's filter:

```bash
pnpm --filter @ft/api test                                   # unit tests
pnpm --filter @ft/api test src/auth/auth.service.spec.ts     # one file
pnpm --filter @ft/api test:cov                               # with coverage
pnpm --filter @ft/api test:e2e                               # e2e (needs Postgres + Redis)
```

Higher up, the tools call the same scripts:

| Where | Target | Runs |
| --- | --- | --- |
| root [package.json](../../package.json) | `pnpm test`, `pnpm test:cov` | `turbo run test` / `test:cov` in every package |
| root [package.json](../../package.json) | `pnpm run ci` | format check, then `turbo run lint typecheck test:cov build` |
| [turbo.json](../../turbo.json) | `test`, `test:cov` | depend on `^build` (build `@ft/shared` first) and `db:generate` (the Prisma client) |
| [Makefile](../../Makefile) | `make test` | `pnpm run test` (unit tests of the whole workspace) |
| [Makefile](../../Makefile) | `make ci` | makes `.env` (`env-file`), starts Postgres and Redis (`stores-up`), runs the `scripts/` checks, then `pnpm run ci`, applies migrations, then `pnpm --filter @ft/api run test:e2e` |
| [Makefile](../../Makefile) | `make` (= `make all`) | `make ci`, then the production stack (`make run`), `make monitoring-check`, then Playwright |

Note: `make test-e2e` in the Makefile is the **Playwright** browser suite, not the Supertest
suite of this chapter. The Supertest suite runs inside `make ci`.

### What the e2e tests need

An e2e test boots the real `AppModule`. `PrismaService` and `RedisService` connect when the
module starts (chapter 3), so **a real Postgres and a real Redis must be running**, with the
migrations applied. The connection comes from environment variables:

| Variable | Used by | Who sets it |
| --- | --- | --- |
| `DATABASE_URL` | `PrismaService` | the Makefile exports a default; CI passes it to `docker run` |
| `REDIS_URL` | `RedisService` | same |
| `SESSION_SECRET` | `configureApp` (cookie signing) | same |

The Makefile says it plainly:

```make
# The api Supertest suite boots the whole Nest graph, and both PrismaService and
# RedisService connect on init, so the stores have to exist. The ci workflow gets
# them from `services:` blocks; this is the local equivalent.
stores-up:
	@$(COMPOSE_DEV) up -d --wait db redis >/dev/null
```

### In CI: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

The `unit-tests` job (matrix leg `app: api`) declares two **services**, a Postgres (image
`pgvector/pgvector`) and a Redis, with health checks. Then it builds the `ci` stage of
[apps/api/Dockerfile](../../apps/api/Dockerfile) and runs, inside it:

```yaml
command: pnpm --filter @ft/api exec prisma migrate deploy && pnpm --filter @ft/api run test:cov && pnpm --filter @ft/api run test:e2e
```

with `--network host` and `DATABASE_URL=postgresql://ft:ft_local_dev@127.0.0.1:5432/...`,
`REDIS_URL=redis://127.0.0.1:6379`. The `coverage/` folder is copied out and uploaded as an
artifact named `coverage-api`. (The other workflow, [e2e.yml](../../.github/workflows/e2e.yml),
is the Playwright browser suite.)

```mermaid
flowchart LR
    PR["Push / pull request"] --> CI["ci.yml: unit-tests (api)"]
    CI --> SVC["services:<br/>Postgres + Redis"]
    CI --> IMG["build Dockerfile<br/>stage ci"]
    IMG --> MIG["prisma migrate deploy"]
    MIG --> COV["test:cov<br/>unit tests + 60% check"]
    COV --> E2E["test:e2e<br/>Supertest suite"]
    SVC -.-> E2E
    E2E --> ART["upload coverage/"]
```

---

## 3. Reading one unit spec: [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts)

`AuthService` (chapter 5) signs users up and checks passwords. It needs `PrismaService`. In a
unit test we give it a **mock** Prisma instead.

### Step 1: a row factory

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

A helper that builds a fake `User` row, the shape Prisma would return. `overrides` lets a test
change one field: `userRow({ passwordHash: 'x' })`. This is a small **fixture**.

### Step 2: the mock and the testing module

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

- `prisma` is a plain object with only the two methods `AuthService` calls, each a `vi.fn()`
  **mock**.
- `beforeEach` runs before **every** `it`. `vi.resetAllMocks()` forgets the answers and calls
  of the previous test, so tests do not leak into each other.
- The real argon2 hash is computed **once** (`??=` assigns only if `hash` is still empty),
  because hashing is slow on purpose.
- **`Test.createTestingModule`** (from `@nestjs/testing`) builds a tiny Nest module, just for
  this test. `{ provide: PrismaService, useValue: prisma }` tells Nest's injector: "when
  someone asks for `PrismaService`, give them this object". So `AuthService` receives the
  mock in its constructor, exactly as it would receive the real one.

```mermaid
flowchart LR
    T["Test.createTestingModule"] --> A["AuthService (real)"]
    T --> P["PrismaService token"]
    P -- "useValue" --> M["prisma mock<br/>user.create = vi.fn()<br/>user.findUnique = vi.fn()"]
    A -- "constructor(prisma)" --> M
```

Only 4 unit specs use `Test.createTestingModule` (auth.service, health.controller,
health.service, llm.module). The other 49 just call `new TheService(fakeA, fakeB)` by hand,
which is simpler when you do not need Nest to wire anything. For example
[auth.guard.spec.ts](../../apps/api/src/auth/auth.guard.spec.ts):
`const auth = { findById: vi.fn() } as unknown as AuthService;`.

### Step 3: the tests

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

- **Arrange**: `mockResolvedValue` makes `create` return a promise of a user row (a stub).
- **Act**: call `signUp`.
- **Assert**: `mock.calls[0][0]` is the first argument of the first call to `create`. The
  test reads the hash the service tried to store and checks it is an argon2id hash, does not
  contain the password, and really matches it.

```ts
    it('turns the unique-constraint race into a 409', async () => {
      prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        service.signUp({ email: 'a@b.co', displayName: 'learner', password }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
```

`mockRejectedValue` makes the mock **fail**, like Postgres does when the email already exists
(Prisma error code `P2002`). The test checks the service turns it into a `ConflictException`
(HTTP 409). The next test checks that **another** error (`connection lost`) is not hidden.
This is the strength of mocks: it is very hard to make a real database fail on demand.

The other groups (`validateCredentials`, `findById`) follow the same pattern: same message for
a wrong password and an unknown email, case-insensitive email, `null` for a missing user.

---

## 4. Reading one e2e spec: [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts)

Its header says why it is an e2e test:

```ts
/**
 * The session behaviour only exists once express-session, connect-redis and the
 * guard run together, so it is proven here rather than in a unit test. Needs a
 * real Postgres and Redis, which CI provides as services.
 */
```

### Step 1: boot the real app

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

- This time the testing module imports the **whole** `AppModule`: every real module, no mock.
- **`configureApp(app)`** is the same function [main.ts](../../apps/api/src/main.ts) calls
  (chapter 2). It adds the `/api` prefix, the Zod validation pipe, the error filter, the
  session middleware with its Redis store, and so on. Because `main.ts` and the tests share
  it, the tested app is set up **exactly** like the real one. The code says it: "Here rather
  than in bootstrap() so the Supertest suite can reach it."
- `app.init()` starts the modules (Prisma and Redis connect) **without** opening a network
  port.
- `beforeAll` / `afterAll` run once for the whole file. The cleanup deletes the test user.
- The email has `Date.now()` in it (`learner-1732...@example.com`), so two runs never clash.

### Step 2: Supertest

**[Supertest](https://github.com/ladjs/supertest)** sends HTTP requests to a Node server: it
binds the app to a random free port on 127.0.0.1, so the test needs no fixed port, and lets you
check the answer:

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

`request(server()).post(url).send(body).expect(201)` sends a POST with a JSON body and fails
if the status is not 201. Then we check the body and the `Set-Cookie` header.

### Step 3: an agent keeps cookies

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

`request.agent(...)` is like a small browser: it **remembers the cookies** between requests.
So after `login`, the next `GET /me` carries the session cookie, and the real `AuthGuard`, the
real Redis session store and the real database all take part.

```mermaid
sequenceDiagram
    participant T as Test (supertest agent)
    participant A as Nest app (configureApp)
    participant R as Redis (sessions)
    participant P as Postgres
    T->>A: POST /api/auth/login
    A->>P: find user, verify hash
    A->>R: save session
    A-->>T: 200 + Set-Cookie ft.sid
    T->>A: GET /api/auth/me (cookie)
    A->>R: load session
    A->>P: find user
    A-->>T: 200 { email }
    T->>A: POST /api/auth/logout
    A->>R: destroy session
    A-->>T: 204
    T->>A: GET /api/auth/me
    A-->>T: 401
```

The other tests of the file: a weak password gives 400 (shared Zod rules), a duplicate email
409, `/me` without a session 401, the **same** 401 message for a wrong password and an unknown
email (so nobody can guess which emails exist), a **new session id** after login (protection
against "session fixation"), and `/api/health` still public.

### Common e2e patterns you will see

- **A real port when sockets are needed**: `await app.listen(0, '127.0.0.1')` (port 0 = "any
  free port") in friends, gateway and messages specs, so a `socket.io-client` can connect.
- **A frozen clock**: `vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })` and
  `vi.setSystemTime(NOON)` in lessons, attempts, finish and gamification specs. Only `Date` is
  faked, so Postgres and Redis still work; the comment in
  [lessons.e2e-spec.ts](../../apps/api/test/lessons.e2e-spec.ts) explains it stops a run that
  crosses midnight UTC from seeing two different days.
- **One address per agent**: signup and login are rate limited per IP, so
  [gateway.e2e-spec.ts](../../apps/api/test/gateway.e2e-spec.ts) gives each agent its own
  `X-Forwarded-For: 192.0.2.N`.
- **Test ids**: fixture lessons use ids like `fr-test-...`, which the seed knows to skip.

---

## 5. Every e2e spec and fixture in [apps/api/test](../../apps/api/test)

```
apps/api/test/
├── *.e2e-spec.ts          18 spec files (run by test:e2e)
├── attempts.fixtures.ts   play a lesson attempt through the routes
├── metrics.fixtures.ts    read one Prometheus series
├── placement.fixtures.ts  exam run, bank rows, fakeRedis, bankPrisma
├── socket.fixtures.ts     open and listen to a socket.io client
└── fixtures/
    ├── seed-valid/        one good item file
    ├── seed-invalid/      one broken item file
    └── seed-duplicate/    two files sharing one sourceId
```

### The e2e specs

| File | What it checks |
| --- | --- |
| [app.e2e-spec.ts](../../apps/api/test/app.e2e-spec.ts) | `GET /api/health` answers the shape `@ft/shared` publishes; the OpenAPI (Swagger) document is served at `/api/docs`. |
| [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts) | Sign up, cookie flags, 409 duplicate, same 401 for wrong password and unknown email, login / `/me` / logout, new session id on login (section 4). |
| [two-factor.e2e-spec.ts](../../apps/api/test/two-factor.e2e-spec.ts) | 2FA enrolment with a real TOTP code, login stopping at 202 with a half session, second factor, recovery code used once, setup/enable refused while on (#216), disabling needs the password. |
| [users.e2e-spec.ts](../../apps/api/test/users.e2e-spec.ts) | Avatar upload (relative path, served back, old file deleted, wrong type / fake bytes / too big refused with codes), time zone stored or refused, the public profile fields. |
| [courses.e2e-spec.ts](../../apps/api/test/courses.e2e-spec.ts) | Course round trip (create, list, goal, level, active language), the rules (no second course, no implicit course, valid goal / language / level), no one sees another user's courses. |
| [placement.e2e-spec.ts](../../apps/api/test/placement.e2e-spec.ts) | The placement exam routes with its own German rows: start at B1, same question on reload, one run at a time, answer, quit, run to a result that places the course, all-timeout run, users kept apart. |
| [lessons.e2e-spec.ts](../../apps/api/test/lessons.e2e-spec.ts) | The three lesson reads (`today`, `lessons` list with search / filter / sort / group / pages, one lesson): before placement, at A1, after a switch to A2, streaks, other users, Swagger. |
| [attempts.e2e-spec.ts](../../apps/api/test/attempts.e2e-spec.ts) | The lesson attempt (#145): start (one attempt for two parallel starts), practice pages and stale cursors, the exam timer with its 2 s grace, closing once, retakes, attempts deleted when a reseed changes the lesson. |
| [finish.e2e-spec.ts](../../apps/api/test/finish.e2e-spec.ts) | Finishing lessons through the attempt routes: who may play, first finish, best score kept, goal met on the third lesson and the streak, one meet for two parallel finishes, goal changes, level switches. |
| [gamification.e2e-spec.ts](../../apps/api/test/gamification.e2e-spec.ts) | XP, the daily challenge and achievements (#95): exact XP numbers, challenge awarded once, GOAL_XP, streak7, levelA1, the achievements route, Swagger. |
| [discussion.e2e-spec.ts](../../apps/api/test/discussion.e2e-spec.ts) | The AI tutor stream on the fixture provider: checks before the stream (session, course, stale attempt), `delta` then `done` events, practice mistakes in the prompt, error codes, cancel when the learner leaves, the per-minute and per-day limits. |
| [friends.e2e-spec.ts](../../apps/api/test/friends.e2e-spec.ts) | User search, "recently active", the request / accept / remove flow heard on real sockets, online events for friends only, crossing requests, account deletion, 10 requests a minute. |
| [messages.e2e-spec.ts](../../apps/api/test/messages.e2e-spec.ts) | Message history paging, who may send, `dm:send` and `dm:read` on real sockets, unread counts, conversation list, acks for refused events, the per-minute budget, unfriending. |
| [gateway.e2e-spec.ts](../../apps/api/test/gateway.e2e-spec.ts) | The socket handshake (session, forged cookie, origin, sockets per session), sockets closed when the session ends (logout, new login, expiry, 2FA change), `course:updated` events, unknown events and flood limits. |
| [error-codes.e2e-spec.ts](../../apps/api/test/error-codes.e2e-spec.ts) | Every error `message` is an `ERROR_CODES` entry (#108): Zod codes, unknown `:lang`, no session, bad or huge JSON body, unknown route, a crash, rate limits on login and signup. |
| [metrics.e2e-spec.ts](../../apps/api/test/metrics.e2e-spec.ts) | HTTP metrics through the real Express pipeline: route template (never the URL), unmatched paths, no `/api/metrics`, bank and account gauges at scrape time. |
| [seed.e2e-spec.ts](../../apps/api/test/seed.e2e-spec.ts) | The seed (chapter 4) on a real Postgres: `seedQuestionBank` (load, idempotent, update keeps id, fails on bad or duplicate files, the 270 real items) and `seedLessons` (outline mapping, no rewrite, ids kept, Restrict, ready flags, invalid lessons refused); `demoSkipReason` and `demoPassword`. |
| [demo.e2e-spec.ts](../../apps/api/test/demo.e2e-spec.ts) | The demo learners' replay (#85) for ben and chloe under test identities: streaks, today's finishes, a finish just after local midnight in Tokyo. |

### The fixtures

| File / folder | What it gives | Used by |
| --- | --- | --- |
| [attempts.fixtures.ts](../../apps/api/test/attempts.fixtures.ts) | `shortLesson(id, position, level, lang)`: a ready lesson row built on the short vocabulary brief of `@ft/shared`. `openAttempt`: starts an attempt and rebuilds the plan and the answer refs as the server does. `playToLast`, `playLesson`: play every page right or blank. | attempts, finish, gamification, discussion, gateway e2e specs |
| [metrics.fixtures.ts](../../apps/api/test/metrics.fixtures.ts) | `seriesValue(metric, labels, suffix)`: the value of one Prometheus series, or `undefined` if it does not exist. | many unit specs (metrics, gateway, llm/gemini, placement, question-stock) and the metrics, attempts, friends, messages and gateway e2e specs |
| [placement.fixtures.ts](../../apps/api/test/placement.fixtures.ts) | `examSession()` (a run as it starts), `questionRow()` (a German B1 bank row), `placementBank()` (3 rows per level and category), `wrongChoice()`, `fakeRedis()` (an in-memory Redis with `set NX`, hashes, lists, `multi`, the lock-release script), `bankPrisma(rows)` (a fake Prisma for the bank). | the four placement unit specs, placement e2e |
| [socket.fixtures.ts](../../apps/api/test/socket.fixtures.ts) | `sessionCookie(res)`, `connect(port, cookie)` (websocket-only client on `/ws`), `nextEvent`, `connected`, `ready` (waits for `dm:unread`), `refusal`, `collect`. | gateway, friends, messages e2e specs |
| [fixtures/seed-valid/](../../apps/api/test/fixtures/seed-valid) | `en-grammar.json` with one correct item (`en-gram-9001`). | seed e2e: loads and maps every column |
| [fixtures/seed-invalid/](../../apps/api/test/fixtures/seed-invalid) | `en-grammar.json` whose item has only 3 options. | seed e2e: must fail loudly, naming file and reason |
| [fixtures/seed-duplicate/](../../apps/api/test/fixtures/seed-duplicate) | `en-grammar-a.json` and `en-grammar-b.json`, both with `sourceId` `en-gram-9002`. | seed e2e: must fail before writing anything |

Note: the `.fixtures.ts` files live in `test/` but some **unit** specs import them too (for
example `fakeRedis` in the placement specs). They do not end in `.e2e-spec.ts` or `.spec.ts`,
so neither config runs them as tests.

---

## 6. Every unit spec in [apps/api/src](../../apps/api/src)

53 files. Each one sits next to the file it tests (`x.service.ts` → `x.service.spec.ts`).

### auth (chapter 5)

| Spec | What it checks |
| --- | --- |
| [auth.controller.spec.ts](../../apps/api/src/auth/auth.controller.spec.ts) | Logout clears the cookie and closes the session's sockets; every new session id (signup, login, 2FA steps) closes the replaced one. |
| [auth.guard.spec.ts](../../apps/api/src/auth/auth.guard.spec.ts) | `@Public` routes pass; no session → 401; attaches the user and counts them active; destroys a session whose user is gone. |
| [auth.service.spec.ts](../../apps/api/src/auth/auth.service.spec.ts) | argon2id hash, lower-cased email, no hash returned, P2002 → 409, credential checks (section 3). |
| [two-factor.service.spec.ts](../../apps/api/src/auth/two-factor.service.spec.ts) | Enrolment (setup, confirm, refused while on, races), the second factor with TOTP codes and recovery codes. |

### users (chapter 5)

| Spec | What it checks |
| --- | --- |
| [users.service.spec.ts](../../apps/api/src/users/users.service.spec.ts) | Avatar paths and file deletion (never outside the storage folder), search escapes wildcards, recently active over 7 UTC days, profile conflicts, streak on the owner's day. |
| [active-day.spec.ts](../../apps/api/src/users/active-day.spec.ts) | `activeDay` keeps the UTC day; `activeSince` goes back 6 days. |

### Infrastructure: prisma, redis, throttler, metrics, health (chapter 3)

| Spec | What it checks |
| --- | --- |
| [prisma.service.spec.ts](../../apps/api/src/prisma/prisma.service.spec.ts) | Connects at bootstrap, disconnects on shutdown, `ping` latency, refuses an empty `DATABASE_URL`. |
| [redis.service.spec.ts](../../apps/api/src/redis/redis.service.spec.ts) | Connects on init, closes on shutdown, `ping`, refuses an empty `REDIS_URL`. |
| [identity-throttler.guard.spec.ts](../../apps/api/src/throttler/identity-throttler.guard.spec.ts) | Keys a signed-in caller on the user, anonymous on the IP; `@ThrottleByIp` routes; route limits and the default ceiling. |
| [rate-limits.spec.ts](../../apps/api/src/throttler/rate-limits.spec.ts) | `readLimit`: default when unset, positive integer, error naming the variable. |
| [throttler-storage.spec.ts](../../apps/api/src/throttler/throttler-storage.spec.ts) | Signup hits expire on their own, even after another route's block. |
| [http-metrics.middleware.spec.ts](../../apps/api/src/metrics/http-metrics.middleware.spec.ts) | Times each request under its route template, 499 for a client that left, "unmatched", counted once; `routeOf`, `methodOf`. |
| [metrics-server.spec.ts](../../apps/api/src/metrics/metrics-server.spec.ts) | `GET /metrics` in Prometheus format, other paths, 500 on a broken registry, port already taken. |
| [metrics.collector.spec.ts](../../apps/api/src/metrics/metrics.collector.spec.ts) | Bank and account gauges, at most one query a minute, keeps old values on failure, 3 s answer when the database hangs. |
| [metrics.spec.ts](../../apps/api/src/metrics/metrics.spec.ts) | The series alerts read exist at 0 from the start; active users over 5 minutes. |
| [health.controller.spec.ts](../../apps/api/src/health/health.controller.spec.ts) | The payload matches the published contract. |
| [health.service.spec.ts](../../apps/api/src/health/health.service.spec.ts) | Version, uptime, ok / degraded / down depending on the Postgres and Redis probes. |

### llm (chapter 6)

| Spec | What it checks |
| --- | --- |
| [disabled.provider.spec.ts](../../apps/api/src/llm/disabled.provider.spec.ts) | Writes no questions; the discussion stream fails before its first piece. |
| [fixture.provider.spec.ts](../../apps/api/src/llm/fixture.provider.spec.ts) | Declines question requests; `streamText` sends a fixed answer and simulates blocked, timeout, dropped and aborted streams. |
| [gemini.provider.spec.ts](../../apps/api/src/llm/gemini.provider.spec.ts) | The request (schema, key in a header), 90 s timeout, parsing, logging, which failures retry and which do not, metrics. |
| [gemini.provider.stream.spec.ts](../../apps/api/src/llm/gemini.provider.stream.spec.ts) | `streamText` over SSE: events split across packets, finish reasons, broken streams, the learner leaving, metrics. |
| [llm.factory.spec.ts](../../apps/api/src/llm/llm.factory.spec.ts) | `createLlmProvider` picks fixture / disabled / Gemini, default model, refuses a missing key or an unknown name. |
| [llm.module.spec.ts](../../apps/api/src/llm/llm.module.spec.ts) | The module builds the provider `LLM_PROVIDER` names, or the fixture by default. |

### courses, placement, question-generation (chapter 7)

| Spec | What it checks |
| --- | --- |
| [courses.service.spec.ts](../../apps/api/src/courses/courses.service.spec.ts) | List through the user, create with no level, `setGoal` (lock, streak, GOAL_XP, socket event after commit), `setLevel` (composite key, not-found). |
| [placement.service.spec.ts](../../apps/api/src/placement/placement.service.spec.ts) | Start, reload, submit (timeouts, lock), quit, metrics, placing the course at the end. |
| [placement-question.service.spec.ts](../../apps/api/src/placement/placement-question.service.spec.ts) | Drawing an unseen question, fallback to generated or seen rows, pool exhausted, the question sent without its answer, metrics. |
| [placement-session.service.spec.ts](../../apps/api/src/placement/placement-session.service.spec.ts) | The Redis lock (one caller, token, retries) and the stored run (expiry, live or not, old formats). Uses `fakeRedis`. |
| [placement-progress.service.spec.ts](../../apps/api/src/placement/placement-progress.service.spec.ts) | Moving the level after each answer, time-outs, the final result. |
| [question-batch.prompt.spec.ts](../../apps/api/src/question-generation/prompts/question-batch.prompt.spec.ts) | The prompt asks for the right questions per category and topic. |
| [question-batch.spec.ts](../../apps/api/src/question-generation/question-batch.spec.ts) | `freshItems` drops duplicates; `toRows` files items in their cell with the right time limit. |
| [question-stock.service.spec.ts](../../apps/api/src/question-generation/question-stock.service.spec.ts) | When a cell is restocked, one restock at a time, 10 min cool-down, retries, never rejects, metrics. |

### lessons (chapter 8)

| Spec | What it checks |
| --- | --- |
| [attempt-ref.spec.ts](../../apps/api/src/lessons/attempt-ref.spec.ts) | `refOf` gives stable, secret-dependent refs. |
| [course-lookup.spec.ts](../../apps/api/src/lessons/course-lookup.spec.ts) | `checkCourse` (404 / 409) and `findLesson` (404, bad ids). |
| [discussion-limits.spec.ts](../../apps/api/src/lessons/discussion-limits.spec.ts) | `readDiscussionLimits` defaults and bad values. |
| [discussion-prompt.spec.ts](../../apps/api/src/lessons/discussion-prompt.spec.ts) | The tutor's system prompt: no exam document, teaching facts as JSON, practice mistakes (never exam answers, at most `MAX_MISTAKES`). |
| [event-stream.spec.ts](../../apps/api/src/lessons/event-stream.spec.ts) | SSE headers, event format, 15 s heartbeat, abort when the browser leaves. |
| [gamification.rules.spec.ts](../../apps/api/src/lessons/gamification.rules.spec.ts) | XP per finish, ranks, the daily challenge hash, `challengeMet`, achievements earned, progress bars. |
| [goal.spec.ts](../../apps/api/src/lessons/goal.spec.ts) | `lockCourse` (FOR UPDATE), `meetGoal` (streak written once), `latestDay`. |
| [roadmap.rules.spec.ts](../../apps/api/src/lessons/roadmap.rules.spec.ts) | The daily plan: status, merge of results, queue order, `plan`, level progress, local days, streaks, a full day-one walkthrough. |
| [lesson-search.spec.ts](../../apps/api/src/lessons/lesson-search.spec.ts) | Search (accents, German ae/oe/ue, every word), filters, sort, group, pages. |
| [outline-files.spec.ts](../../apps/api/src/lessons/outline-files.spec.ts) | Every file in `content/outlines`: schema, name, entry counts per kind, no `-test-` id, no duplicate id or title. |
| [lesson-files.spec.ts](../../apps/api/src/lessons/lesson-files.spec.ts) | Every file in `content/briefs` and `content/lessons`: has an outline entry, passes `validateLesson`, no orphan content, no duplicate title, French uses tu. |
| [lesson-complete.spec.ts](../../apps/api/src/lessons/lesson-complete.spec.ts) | The `complete` step of `scripts/lessons` (chapter 11). |
| [lesson-edits.spec.ts](../../apps/api/src/lessons/lesson-edits.spec.ts) | Edits, reply parsing and refusal handling of `scripts/lessons` (chapter 11). |

### items

| Spec | What it checks |
| --- | --- |
| [item-files.spec.ts](../../apps/api/src/items/item-files.spec.ts) | Every file in `content/items` (placement questions): schema, file name, no shared id, missing categories reported (chapter 11). |

### gateway, presence, friends, messages, demo (chapter 9)

| Spec | What it checks |
| --- | --- |
| [socket.gateway.spec.ts](../../apps/api/src/gateway/socket.gateway.spec.ts) | `sameOrigin`, `fixedWindow`, the handshake, event screening and limits, acks, presence and unread on connect, closing ended sessions. |
| [sockets.service.spec.ts](../../apps/api/src/gateway/sockets.service.spec.ts) | Emits to the user's room only; closes one session's sockets. |
| [socket-exception.filter.spec.ts](../../apps/api/src/gateway/socket-exception.filter.spec.ts) | Error codes go to the ack, or to `app:error` when there is no ack. |
| [presence.service.spec.ts](../../apps/api/src/presence/presence.service.spec.ts) | Online on the first socket, offline after the grace period, counts kept per user, reset at boot. |
| [friends.service.spec.ts](../../apps/api/src/friends/friends.service.spec.ts) | `pairKey`, sending requests (self, crossing requests, 404), writes that find nothing, the list with online flags. |
| [messages.service.spec.ts](../../apps/api/src/messages/messages.service.spec.ts) | Send (one transaction, both rooms told, budget), read, paging with a cursor, conversation list. |
| [unread.spec.ts](../../apps/api/src/messages/unread.spec.ts) | `unreadCounts` per conversation. |
| [demo.planner.spec.ts](../../apps/api/src/demo/demo.planner.spec.ts) | `atLocalTime`, `daysBefore`, `pastScore`, `planCourse`, `daysToAttemptAll`, the six demo profiles. |

Three of these specs read **real files**, not code: `outline-files`, `lesson-files` and
`item-files`. The comment in `item-files.spec.ts` says why they are tests and not scripts:
"it runs in `make`, in `pnpm test` and in CI with no extra wiring, and it fails for the person
who wrote the item instead of for whoever runs the seed a week later."

---

## 7. The `coverage/` folder

`pnpm --filter @ft/api test:cov` writes `apps/api/coverage/`. It is
**generated** and listed in `.gitignore`, so it is never committed.

```
apps/api/coverage/
├── lcov.info        machine-readable list of covered lines (for tools and CI)
└── lcov-report/     a small website: open index.html in a browser
    ├── index.html   one row per folder, with % of lines / functions / branches
    └── ...          one page per file, uncovered lines in red
```

These come from `reporter: ['text', 'lcov']` in the unit config: `text` is the table printed in
the terminal, `lcov` makes these two outputs. In CI the folder is uploaded as the artifact
`coverage-api` (kept 7 days). If coverage drops under 60% lines or 60% functions, `test:cov`
exits with an error and CI fails. Only unit tests count: the e2e run has no coverage.

---

## Key ideas to remember

- A **unit test** checks one piece with stand-ins around it; an **e2e test** checks the whole
  app with a real Postgres and Redis.
- This project uses **Vitest**, with two configs: `vitest.config.mts` (`src/**/*.spec.ts`) and
  `vitest.config.e2e.mts` (`test/**/*.e2e-spec.ts`).
- The **swc** plugin is the only transformer (Oxc is off, so only one tool writes the decorator
  metadata); without that metadata, Nest cannot inject anything.
- Mocks are `vi.fn()`; most specs build the service **by hand** with `new`, a few use
  `Test.createTestingModule` with `{ provide, useValue }`.
- e2e specs boot `AppModule`, call the **same `configureApp`** as `main.ts`, and talk to it with
  **Supertest** (`request.agent` keeps cookies).
- e2e runs **one file at a time**, with the **fixture** LLM and default rate limits.
- `make ci` and CI start Postgres and Redis, run migrations, then `test:cov` and `test:e2e`.
- Coverage must stay at **60% lines and functions**; the report is in `coverage/`.

---

Previous: [Chapter 9 — Social and real time](09-social-and-realtime.md) · Next: [Chapter 11 — The scripts folder](11-scripts.md) · [Back to index](README.md)
