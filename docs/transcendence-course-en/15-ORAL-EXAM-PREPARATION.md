# 15 · Preparing for the defense

Format of each question: **Answer** (the substance), **Why** (what justifies it),
**Files**, **Out loud** (a natural phrasing, 20 to 40 seconds).

---

## A. Two-minute project presentation

> "Our ft_transcendence is a language-learning platform: English,
> French and German, with an interface in those three languages.
>
> A learner creates an account, chooses a language and a daily goal of 10, 30 or
> 60 minutes. They then take an adaptive placement test: we start at level B1 and
> go up or down by binary search depending on their answers, until we find their CEFR level,
> from A1 to C2.
>
> Every day, the application offers them the number of lessons that matches their goal.
> There are four types of lessons: grammar, vocabulary, speech acts and reading, with
> exercises corrected right away and then a timed exam. The score, the day streak
> and the XP are computed by the server.
>
> There is also a social part: public profiles, friends, and real-time online status.
>
> Technically: Next.js for the interface, NestJS for all the logic, PostgreSQL and
> Redis, Socket.IO for real time, all behind a Caddy reverse proxy over HTTPS,
> in Docker, launched by a single command: `make`."

## B. Five-minute technical presentation

1. **The rule (30 s)**: "NestJS owns all the business logic and the data access;
   Next.js does the presentation and the server rendering. There is no Prisma in the front end."
2. **The topology (60 s)**: draw browser → Caddy (only published port, HTTPS) →
   `/api` and `/ws` to NestJS, `/grafana` to Grafana, the rest to Next; Next calls
   the API over the Docker network for SSR; the API talks to Postgres and Redis. "Everything is
   on the same origin, so no CORS, and the session cookie is first-party."
3. **The monorepo (45 s)**: pnpm + Turborepo; `apps/web`, `apps/api`, `packages/shared`
   (Zod schemas, error codes, socket contract, lesson engine), `packages/ui`;
   `content/` for the lessons in JSON.
4. **The backend (60 s)**: Nest modules per domain; global pipeline in `configureApp`:
   `/api` prefix, Redis sessions, Zod pipe, error-code filter, Swagger; two
   global guards: throttler and `AuthGuard`, private by default; Prisma 7 with 10 tables
   and 13 migrations; `FOR UPDATE` lock on the course for concurrency.
5. **Security (45 s)**: argon2id, regenerated sessions, `httpOnly` `SameSite=Lax` cookie,
   TOTP 2FA with backup codes, throttler on login, double validation with the same schema.
6. **Real time (30 s)**: Socket.IO on `/ws`, authenticated by the same cookie, rooms per
   user, events after commit; presence counted in Redis.
7. **Quality and ops (30 s)**: ~1,900 unit tests, Supertest on a real database, Playwright
   on 3 browsers with a "console gate"; 4 CI workflows; multi-arch images;
   Prometheus, Grafana, Discord alerts; deployment by systemd timer.

## C. Ten-minute detailed presentation

Go over B again, then add four commented demonstrations (≈ 1 min 15 each):

1. **Sign-up → onboarding**: show the instant validation (same Zod schema),
   then the `409` response if the e-mail is taken (translated code). Open `/api/docs`.
2. **Placement**: explain the binary search (B1, 2 questions per category, 1 mistake
   tolerated), the session in Redis with a lock, the server-side timer, the fact that the right
   answer is never sent, the background restocking by the LLM.
3. **A grammar lesson**: page by page; open the network tools to show that the
   response contains neither keys nor ids (HMAC refs); timed exam; 35/65 score;
   redo a page → `409 attempt.stale`. Two tabs: the other one updates.
4. **Social**: two browsers, friend request, acceptance, green dot lighting up;
   close a tab: the dot goes off 10 seconds later.

Finish with **the honest state** (30 s): "The chat, the RAG and the XP display are not
done; three lesson types out of four are ready on the server side but not yet playable
in the interface."

---

## D. Hard technical questions (48)

### Architecture

**1. Why two server applications instead of one?**
- Answer: Next for server rendering and i18n; Nest for the logic, with DI, guards, Swagger, WebSockets.
- Why: separate presentation and business logic; a single door to the data.
- Files: `docs/ARCHITECTURE.md` §1, `apps/web/package.json` (no Prisma).
- Out loud: "Next only displays. If tomorrow we build a mobile app, it talks to the same API."

**2. How does Next call the API during SSR, and with what identity?**
- Answer: `fetch('http://api:3001/api/...')`, copying the cookies and `x-forwarded-for`.
- Why: same session, same rules as the browser, without leaving Docker.
- Files: `apps/web/lib/api.ts` (`fetchWithRequestHeaderAndIP`).
- Out loud: "The Next server behaves like the user's browser: it presents their cookie."

**3. Why no CORS?**
- Answer: pages, API and WebSocket are on the same origin thanks to Caddy.
- Files: `infra/caddy/Caddyfile`.
- Out loud: "The browser only sees one site."

**4. What happens if the API is stopped?**
- Answer: the server pages receive `unavailable` and throw an error (`error.tsx` page); the socket switches to "Reconnecting…" and probes `/healthz/api`; the monitoring alerts (`ApiDown`, `WebCannotReachApi`).
- Files: `apps/web/lib/api.ts`, `lib/reconnect.ts`, `infra/monitoring/prometheus/rules/alerts.yml`.

**5. Why does `@ft/shared` contain the lesson engine if only the server runs it?**
- Answer: it also shares the **view types** and the response schemas used by the front end; the engine is pure (no database), so testable and reusable.
- Files: `packages/shared/src/lessons/player/`.
- Out loud: "The front end needs the types of what the engine returns; the grading code, on the other hand, is only called by the API."

**6. How many API instances can you run?**
- Answer: only one today (presence, throttler, restocking in memory; local rooms).
- Files: comments in `presence.service.ts`, `question-stock.service.ts`, `ARCHITECTURE.md` §4.
- Out loud: "One, it is a deliberate and documented choice; moving to several requires the Socket.IO Redis adapter."

### Frontend

**7. Server Component or Client Component: how do you choose?**
- Answer: reading = server; interacting (form, player, socket) = `'use client'`.
- Files: `learn/[lang]/page.tsx` (server), `goal-picker.tsx` (client).

**8. How does the page update after a write?**
- Answer: `router.refresh()` reruns the server rendering; in the other tabs, the `course:updated` event does the same via `RefreshOn`.
- Files: `lib/use-course-save.ts`, `components/refresh-on.tsx`.

**9. How does internationalization work?**
- Answer: next-intl, mandatory `[locale]` segment, `proxy.ts` middleware, 3 catalogs of 475 lines, errors translated by code.
- Files: `apps/web/i18n/*`, `apps/web/messages/*.json`, `lib/error-message.ts`.

**10. Where is the global state?**
- Answer: there is none, except the socket as a module variable exposed through `useSyncExternalStore`.
- Files: `components/tab-socket.ts`.

**11. How do you avoid hydration errors and console errors?**
- Answer: Playwright console gate on the production build; probe before the socket reconnects; `suppressHydrationWarning` only on `<html>`.
- Files: `e2e/support/console-guard.ts`, `app/[locale]/layout.tsx`.

**12. Why validate the API responses on the front end?**
- Answer: to never display unexpected data; an invalid response becomes a handled error.
- Files: `lib/api.ts`, `lib/api-client.ts` (`schema.safeParseAsync`).

### Backend

**13. How does a route become public?**
- Answer: `@Public()` decorator read by the global `AuthGuard`.
- Files: `auth/auth.decorators.ts`, `auth/auth.guard.ts`.

**14. What does a validation error return?**
- Answer: `400 { statusCode, message: ["code", …] }`.
- Files: `validation.pipe.ts`.

**15. What happens with an unexpected exception?**
- Answer: `ErrorCodeFilter` returns `500 server.unexpected` and logs the stack.
- Files: `error-code.filter.ts`.

**16. How does dependency injection concretely help you?**
- Answer: `LLM_PROVIDER` is a token; the factory chooses Gemini or the fixture; the tests inject test doubles.
- Files: `llm/llm.module.ts`, `llm/llm.factory.ts`.

**17. How do you handle two simultaneous lesson completions?**
- Answer: transaction + `SELECT … FOR UPDATE` on `UserLevel`; the second one waits then rereads.
- Files: `lessons/goal.ts` (`lockCourse`).

**18. Why are socket events sent after the transaction?**
- Answer: otherwise another tab could read the old value or a rolled-back value.
- Files: `courses/courses.service.ts`, `lessons/attempts.service.ts`.

### Database

**19. Which table represents a course?**
- Answer: `UserLevel`, unique per `(userId, lang)`.
- Files: `schema.prisma`.

**20. Why does `LessonResult` have a composite key?**
- Answer: one row per (course, lesson); redoing updates it with the best score.
- Files: `schema.prisma`, `roadmap.rules.ts` (`merge`).

**21. How do you avoid duplicate friendships?**
- Answer: `pairKey` = sorted ids, primary key.
- Files: `friends/pair.ts`.

**22. How does the content get into the database?**
- Answer: `make seed` → `seed.ts`: upsert of 3,990 lessons, validation, `ready` for 216.
- Files: `apps/api/prisma/seed.ts`.

**23. How do you version the schema?**
- Answer: 13 Prisma migrations; `migrate deploy` in production; CI checks that there is no drift.
- Files: `prisma/migrations/`, `scripts/check-prisma-drift.sh`.

**24. Why Redis in addition to Postgres?**
- Answer: ephemeral data with expiry: sessions, placement test + lock, presence.
- Files: `app.setup.ts`, `placement-session.service.ts`, `presence.service.ts`.

### Authentication

**25. JWT or sessions?**
- Answer: server sessions in Redis, opaque cookie.
- Why: immediate revocation.
- Out loud: "A logout really is a logout."

**26. How do you store passwords?**
- Answer: argon2id, OWASP parameters, salt included.
- Files: `auth/auth.service.ts`.

**27. How does your 2FA work?**
- Answer: TOTP (6 digits, 30 s, ±1 step), activation after a first valid code, 10 single-use SHA-256 backup codes, disabling requires the password.
- Files: `auth/two-factor.service.ts`.

**28. Why does login with 2FA return 202?**
- Answer: credentials accepted but login not completed; no user in the body.
- Files: `auth/auth.controller.ts`.

**29. What is session fixation and how do you prevent it?**
- Answer: forcing a known session id on the victim; we regenerate the id at every privilege change.
- Files: `auth.controller.ts` (`regenerate`).

**30. Does a deleted user keep access?**
- Answer: no, the `AuthGuard` reloads the user on every request and destroys the session.
- Files: `auth.guard.ts`.

### Communication

**31. How is the socket authenticated?**
- Answer: `SessionIoAdapter` plugs `express-session` into engine.io; checks Origin, `userId`, account, ≤ 20 sockets.
- Files: `gateway/session-io.adapter.ts`, `gateway/socket.gateway.ts`.

**32. What events exist?**
- Answer: `course:updated`, `friend:request|accepted|removed`, `presence:update`, `app:error`. None from the client.
- Files: `packages/shared/src/events/socket.ts`.

**33. How does presence work?**
- Answer: Redis counter per user, 10 s grace period, accepted friends only, snapshot on connection, reset at startup.
- Files: `presence/presence.service.ts`.

**34. How do you handle reconnection?**
- Answer: 1-2-4-8-10 s backoff with jitter, probe `/healthz/api` before reconnecting, refresh on reconnection.
- Files: `lib/reconnect.ts`, `components/tab-socket.ts`.

### Infrastructure

**35. What does `make` do?**
- Answer: local CI → production stack → migrations + seed → certificate → monitoring-check → Playwright.
- Files: `Makefile` (`all`, `run`, `ci`).

**36. Why Caddy?**
- Answer: automatic TLS (internal CA locally, ACME in production), short configuration, HTTP/3.
- Files: `infra/caddy/Caddyfile*`.

**37. How do you deploy?**
- Answer: multi-arch images on GHCR on every push; on the VM, a systemd timer every 5 min pulls the images, migrates and restarts.
- Files: `.github/workflows/images.yml`, `infra/deploy/deploy.sh`.

**38. What do you monitor?**
- Answer: availability, API errors and latency, event loop, Postgres, Redis, host, login failures, LLM, restocking, exhausted bank; 25 alerts to Discord.
- Files: `infra/monitoring/prometheus/rules/alerts.yml`, `apps/api/src/metrics/metrics.ts`.

### Security

**39. How is the avatar upload secured?**
- Answer: 3 MIME types, 2 MiB, magic-byte check, UUID name, the client cannot choose the path.
- Files: `users/users.controller.ts`, `schemas/user.ts` (`UpdateProfileSchema` without `avatarUrl`).

**40. How do you prevent account enumeration?**
- Answer: same error, and a dummy argon2 check for an unknown e-mail.
- Files: `auth.service.ts` (`DUMMY_HASH`).

**41. How could the learner cheat on a lesson, and why can't they?**
- Answer: they receive neither keys nor ids; the order depends on HMACs; no score route; server-side deadline; a page is submitted once.
- Files: `lessons/attempt-ref.ts`, `shared/lessons/player/redact.ts`, `attempt.ts`.

**42. How are secrets managed?**
- Answer: `.env` ignored, `.env.example`, gitleaks, startup refused if `SESSION_SECRET` < 32.
- Files: `.env.example`, `app.setup.ts`, `hygiene.yml`.

### Features

**43. How is the daily plan computed?**
- Answer: target = goal/10; unpassed first in order, then the passed ones done longest ago; 3 extra.
- Files: `lessons/roadmap.rules.ts` (`queue`, `plan`).

**44. How does the streak work?**
- Answer: reach the target on a day; it continues if the previous day was met, otherwise it restarts at 1; day in the user's time zone, never going backwards.
- Files: `roadmap.rules.ts` (`metOn`, `courseDay`).

**45. Where does AI come in in production?**
- Answer: only to restock the placement question bank (Gemini, structured JSON), in the background.
- Files: `question-generation/question-stock.service.ts`, `llm/gemini.provider.ts`.

**46. What gamification do you have?**
- Answer: XP (10/lesson + improvement, 20 goal, 30 challenge), ranks, deterministic daily challenge, 16 achievements; display: streak only.
- Files: `lessons/gamification*.ts`, `shared/schemas/gamification.ts`.

### Technical choices

**47. Why Zod rather than class-validator?**
- Answer: to share the schema with the browser.

**48. Why a monorepo?**
- Answer: shared contract without publishing, one CI, atomic changes.

---

## E. Trick questions

| Question | The trap | Right answer |
|---|---|---|
| "Show me your chat." | It does not exist. | "The `/chat` page is a mockup. Real time exists, but not the chat; it is ticket #158." |
| "Where is your RAG?" | pgvector is installed. | "Nowhere: the extension is in the image, no table or query uses it." |
| "You use JWTs, right?" | A common reflex. | "No, server sessions in Redis." |
| "Is the score computed in the browser?" | | "No, no route accepts a score." |
| "Does the front end read the database for SSR?" | | "No, it calls the API over the Docker network." |
| "Does your WebSocket receive messages from the client?" | | "No, `CLIENT_EVENTS` is empty; the server rejects any event." |
| "Why 4,000 lessons?" | The README says "about 4,000". | "3,990 in the syllabus, 216 written and ready." |
| "Can I play a vocabulary lesson?" | | "Not in the browser today: only grammar has its screens. The API can play them." |
| "What can your admin do?" | `Role.ADMIN` exists. | "Nothing: no role check is enforced." |
| "Is the exam timer in JavaScript?" | | "The countdown is, but the deadline is in the database; a late page is counted as empty." |
| "Wouldn't `trust proxy: true` be simpler?" | | "No: a client could spoof their IP and bypass the throttler." |
| "Does your throttler survive a restart?" | | "No, it is in memory." |
| "Do placement questions never repeat?" | | "Never within the same test; between two tests, only if the bank is exhausted, starting with the one seen longest ago." |
| "Why SHA-256 for the backup codes, isn't that weak?" | | "They are random and long: nothing to guess, and we can look them up by index." |

## F. Your potential weak points

1. **The lesson engine** (`packages/shared/src/lessons/player`): many files and a lot of
   vocabulary (plan, page, unit, item, ref, cursor). Review [09 F6](09-BUSINESS-FEATURES.md#f6--playing-a-lesson-the-attempt-engine) and draw flow 4.
2. **The difference between the front end's two HTTP clients** (`api.ts` vs `api-client.ts`).
3. **The placement**: be able to walk through the binary search on an example (B1 → B2 or A2…).
4. **The subject's modules**: know the honest point count (module 01).
5. **Presence**: the 10 s grace period and the reset at startup are subtle.
6. **Prisma 7**: mandatory adapter, URL in `prisma.config.ts`, client generated in `src/`.
7. **The CI**: 4 workflows, be able to say which one does what.
8. **Your own contribution**: the subject requires each member to explain it. Prepare 3 PRs
   that you made or reviewed (`git log --author=<you>`).
