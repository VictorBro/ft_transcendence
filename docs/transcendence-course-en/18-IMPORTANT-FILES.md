# 18 · The important files

The 36 files that let you understand the application, in the recommended reading order.

## Overview

| # | File | Why it matters |
|---|---|---|
| 1 | `README.md` | Official presentation, team, launch commands |
| 2 | `docs/ARCHITECTURE.md` | Containers, routing, real time: the team's reference |
| 3 | `docs/PRODUCT_ARCHITECTURE.md` | Learner journey, targeted modules, AI, REST/WS transport |
| 4 | `Makefile` | The single `make` command and all the others |
| 5 | `compose.yml` | The 12 services, network, volumes |
| 6 | `infra/caddy/Caddyfile` | HTTPS entry point and path-based routing |

## Backend

| # | File | Why it matters |
|---|---|---|
| 7 | `apps/api/src/main.ts` | Startup, port 3001, metrics server |
| 8 | `apps/api/src/app.setup.ts` | The global pipeline: prefix, Redis sessions, cookie, pipe, filter, WebSocket, Swagger |
| 9 | `apps/api/src/app.module.ts` | The map of the modules and the global throttler |
| 10 | `apps/api/src/validation.pipe.ts` | Zod validation and error format |
| 11 | `apps/api/src/error-code.filter.ts` | Guarantees that no response contains a sentence |
| 12 | `apps/api/src/auth/auth.controller.ts` | Sign-up, login, 2FA, logout, session regeneration |
| 13 | `apps/api/src/auth/auth.service.ts` | argon2id, dummy hash, `SessionUser` |
| 14 | `apps/api/src/auth/auth.guard.ts` | Private by default, reloads the user |
| 15 | `apps/api/src/auth/two-factor.service.ts` | TOTP and backup codes |
| 16 | `apps/api/src/courses/courses.service.ts` | Create a course, goal, level, event after commit |
| 17 | `apps/api/src/placement/placement.service.ts` + `placement-progress.service.ts` | The adaptive test |
| 18 | `apps/api/src/question-generation/question-stock.service.ts` | Restocking by the LLM |
| 19 | `apps/api/src/llm/llm.factory.ts` | Choice of Gemini / fixture |
| 20 | `apps/api/src/lessons/lessons.service.ts` | Today, list, `applyFinish` |
| 21 | `apps/api/src/lessons/attempts.service.ts` | Playing a lesson on the server side |
| 22 | `apps/api/src/lessons/roadmap.rules.ts` | Daily plan, streak, pass, level completed |
| 23 | `apps/api/src/lessons/goal.ts` | `lockCourse`, `meetGoal` |
| 24 | `apps/api/src/lessons/gamification.rules.ts` | XP, ranks, challenge, achievements |
| 25 | `apps/api/src/friends/friends.service.ts` | Friendships and notifications |
| 26 | `apps/api/src/gateway/socket.gateway.ts` | Handshake, safeguards, presence |
| 27 | `apps/api/src/presence/presence.service.ts` | Redis counter, 10 s grace period |
| 28 | `apps/api/prisma/schema.prisma` | The data model |
| 29 | `apps/api/prisma/seed.ts` | Loading and validating the content |

## Shared

| # | File | Why it matters |
|---|---|---|
| 30 | `packages/shared/src/schemas/user.ts` | Sign-up and profile rules (the same schema front/back) |
| 31 | `packages/shared/src/events/socket.ts` | The real-time contract |
| 32 | `packages/shared/src/lessons/player/attempt.ts` (+ `score.ts`, `redact.ts`) | The lesson engine |

## Frontend

| # | File | Why it matters |
|---|---|---|
| 33 | `apps/web/lib/api.ts` + `apps/web/lib/api-client.ts` | The two paths to the API |
| 34 | `apps/web/components/tab-socket.ts` | The tab's socket, reconnection, presence |
| 35 | `apps/web/app/[locale]/(dashboard)/learn/[lang]/page.tsx` | The main "today" page |
| 36 | `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/play/player.tsx` | The lesson player |

## The Understand Anything graph

The `.ua/` folder at the root contains the map produced with the
[Understand Anything](https://github.com/Egonex-AI/Understand-Anything) plugin:

| File | Contents |
|---|---|
| `.ua/knowledge-graph.json` | The graph: one node per file (and per significant function/class), the `imports`, `calls`, `contains`, `tested_by`… edges, the architecture layers and a guided tour, in French (the English translation of this graph is in `docs/transcendence-course-en/.ua/`) |
| `.ua/domain-graph.json` | The business view (domains, flows, steps), if present |
| `.ua/config.json` | `{"language":"fr"}` |
| `.ua/.understandignore` | What was excluded (JSON teaching content, mockups, branding, lockfile) |

The graph is for **exploring** (who imports what, where a function is tested). Its summaries
are AI-generated: **the course takes precedence**, because it has been checked against the code. To open the
interactive dashboard, see [README.md](README.md#the-understand-anything-graph).
