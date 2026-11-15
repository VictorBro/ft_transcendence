# 17 · Technical glossary (Module 14)

The terms are explained **as they are used in our project**. Alphabetical order.

## General terms

| Term | Simple explanation | In our project |
|---|---|---|
| **Adapter (Prisma)** | Driver that connects Prisma to a database. | `@prisma/adapter-pg` (node-postgres), mandatory in Prisma 7. |
| **API** | Set of entry points a program exposes to others. | The NestJS API under `/api`. |
| **App Router** | Next.js routing system based on the `app/` folder. | `apps/web/app/[locale]/…` |
| **argon2id** | Password-hashing algorithm, deliberately slow, GPU-resistant. | `auth.service.ts`. |
| **Authentication** | Proving who you are. | Password + TOTP. |
| **Authorization** | Checking what you are allowed to do. | `AuthGuard`, "my own" routes via `@CurrentUser()`. |
| **Cascade** | Automatically deleting dependent rows. | Deleting a `User` deletes its `UserLevel` rows. |
| **CEFR (CECRL)** | Common European Framework of language levels A1 → C2. | `Level` enum. |
| **Client Component** | React component that also runs in the browser (`'use client'`). | Forms, lesson player. |
| **Container** | Isolated process started from a Docker image. | 12 Compose services. |
| **Controller** | Nest class that receives a request and calls a service. | `*.controller.ts`. |
| **CORS** | Browser rules for requests to another origin. | Unnecessary for us (same origin). |
| **CSRF** | Attack that makes the victim's browser send a request. | Mitigated by `SameSite=Lax`. |
| **Dependency injection (DI)** | The framework provides the objects a class needs. | `constructor(private prisma: PrismaService)`. |
| **DTO** | Object that describes the shape of a request/response. | `createZodDto(Schema)`. |
| **Endpoint** | One URL + one HTTP method of the API. | `POST /api/auth/login`. |
| **Exponential backoff** | Waiting longer and longer between two attempts. | Socket reconnection: 1, 2, 4, 8, 10 s. |
| **Foreign key (FK)** | Column that references another table's primary key. | `UserLevel.userId → User.id`. |
| **Guard** | Nest code that allows or rejects a request before the controller. | `AuthGuard`, `IdentityThrottlerGuard`. |
| **Healthcheck** | Periodic test that says whether a service is healthy. | Dockerfiles' `HEALTHCHECK`, `/api/health`. |
| **HMAC** | Signature of a message with a secret key. | Lesson unit refs (`attempt-ref.ts`). |
| **Hook (React)** | `useXxx` function that gives a component state or effects. | `useErrorMessage`, `useSocketStatus`. |
| **httpOnly cookie** | Cookie inaccessible to the page's JavaScript. | `ft.sid`. |
| **Hydration** | Moment when React "takes over" the HTML rendered by the server. | Source of console errors, watched by the console gate. |
| **i18n** | Internationalization: translating the interface. | next-intl, 3 languages. |
| **Middleware** | Code that runs on every request before it is handled. | `express-session`, `httpMetrics`, `proxy.ts` on the Next side. |
| **Migration** | Dated SQL file that evolves the schema. | 13 in `prisma/migrations`. |
| **Monorepo** | One repository for several projects. | pnpm workspaces. |
| **ORM** | Library that manipulates the database through objects. | Prisma. |
| **Pipe** | Nest code that validates/transforms an input value. | `CodeValidationPipe`, `LangParam`. |
| **Primary key (PK)** | Unique identifier of a row. | `User.id` (UUID), `Friendship.pairKey`. |
| **Props** | Parameters passed to a React component. | `<GoalPicker lang dailyGoal />`. |
| **Rate limiting / throttling** | Limiting the number of requests. | 100/min global, 5/min login. |
| **Reverse proxy** | Server placed in front of others, which receives and redistributes. | Caddy. |
| **Room (Socket.IO)** | Group of sockets targeted together. | `user:<id>`, `session:<sid>`. |
| **Server Component** | React component that runs only on the server. | The pages. |
| **Service** | Class that contains the business logic. | `LessonsService`. |
| **Session** | Login state kept on the server side, designated by an id in a cookie. | Redis `sess:<id>`. |
| **Session fixation** | Forcing a known session id before login. | Prevented by `session.regenerate`. |
| **SSR** | Rendering the HTML page on the server side. | Next pages that call the API. |
| **State** | Data that changes in a component. | `useState`; no global store. |
| **TOTP** | Time-based one-time code (authenticator apps). | `otpauth`, 6 digits, 30 s. |
| **Transaction** | Group of database operations, all or nothing. | `prisma.$transaction(async (tx) => …)`. |
| **Upsert** | Insert, or update if the row exists. | `lessonResult.upsert`, seed. |
| **Volume** | Persistent Docker storage. | `pg-data`, `avatars-data`… |
| **WebSocket** | Permanent bidirectional connection. | Socket.IO on `/ws`. |
| **Zod** | TypeScript validation schema library. | `@ft/shared`. |

## Terms specific to our code

| Term | Explanation |
|---|---|
| **`applyFinish`** | Function that records the end of a lesson: best score, goal, streak, XP, achievements (`lessons.service.ts`). |
| **Attempt** | One play-through of a lesson by a learner, `LessonAttempt`: cursor, answers, deadline, secret. |
| **`award`** | Computes and writes XP, challenge and achievements (`gamification.ts`). |
| **Brief** | A lesson's info sheet (title, summary, words, rules), JSON in `content/briefs` then `Lesson.brief`. |
| **Cell** | (language, level, category) triple of the question bank, the unit of restocking. |
| **Challenge (daily challenge)** | One of the 6 challenges, chosen by a hash of (course, day). |
| **`checkCourse`** | Checks a loaded course: `404 course.notFound`, `409 course.notPlaced`. |
| **Console gate** | Playwright test that fails on the slightest console error. |
| **Content (lesson)** | A lesson's exercises, `content/lessons/<id>.json` → `Lesson.content` (null for vocabulary). |
| **Course** | A `UserLevel`: one user learning one language. |
| **Course day (`courseDay`)** | "Today" in the learner's time zone, never before the last known day. |
| **Cursor** | Index of an attempt's current page; never goes backwards. |
| **Daily goal** | 10, 30 or 60 minutes; target = goal / 10 lessons. |
| **Deadline** | Time limit of the current exam page, in the database. |
| **`ERROR_CODES`** | List of all the error codes (`schemas/errors.ts`). |
| **Extra** | The 3 lessons offered "on top of" the day's plan. |
| **Fixture provider** | Fake LLM, answers written in advance, the default. |
| **Item** | A block of a lesson page (explanation, exercise…). |
| **`kinds` / `playable`** | Registry of renderers per lesson type in the web app; only grammar is in it. |
| **`lockCourse`** | `SELECT … FOR UPDATE` on the `UserLevel` row. |
| **Mother tongue** | Language of an attempt's instructions, fixed at the start. |
| **Outline** | Syllabus for one language and one level (`content/outlines`); also the summary of a lesson returned to the front end. |
| **`pairKey`** | Key of a friendship: two sorted UUIDs joined by `:`. |
| **Placement** | Adaptive level test (binary search starting from B1). |
| **Plan (day)** | `done` / `proposed` / `extra` (`roadmap.rules.ts`). |
| **Plan (lesson)** | The lesson flattened into pages and units, with all the keys, rebuilt on every request, never sent. |
| **Presence** | Online status: Redis counter `presence:<id>`. |
| **`ready`** | A lesson has its files and passes validation: it can be offered and played. |
| **Redact** | Building the view of a page without the answers (`redact.ts`). |
| **Ref** | Opaque identifier of a unit/option seen by the browser: truncated HMAC. |
| **`RefreshOn`** | Component that calls `router.refresh()` on a socket event. |
| **Restock** | Generation of new questions by the LLM when a cell is almost empty. |
| **Roadmap rules** | Pure rules for the day's plan, the streak and the levels. |
| **`SessionUser`** | What the user may see about themselves (never the hash). |
| **Stale (`attempt.stale`)** | Submission of a page that is not the cursor's page, or of a replaced attempt. |
| **Tab socket** | The single socket of a tab (`tab-socket.ts`). |
| **Unit** | An answer scored 0, 0.5 or 1. |
| **`UserLevel`** | Table of a course (see Course). |
