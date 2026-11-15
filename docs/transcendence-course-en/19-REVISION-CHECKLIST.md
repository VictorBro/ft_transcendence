# 19 · Revision checklist

Tick an item when you can do it **without notes, out loud**.

## The day before: check the project

- [ ] `cp .env.example .env` then `make` run **all the way through** on my machine (not verifiable in the environment where this course was written).
- [ ] I have opened `https://localhost`, `https://localhost/api/docs`, `https://localhost/grafana`.
- [ ] I have a demo account ready (`DEMO_PASSWORD` in `.env`) or I know how to create one in 30 s.
- [ ] I have a **grammar** lesson ready to play for the demo.
- [ ] The TODOs in `README.md` (logins, organization, communication) are filled in.
- [ ] I know my own contribution: 3 PRs I can explain.

## Understanding the project

- [ ] I can present the project in 2 minutes ([15 A](15-ORAL-EXAM-PREPARATION.md#a-two-minute-project-presentation)).
- [ ] I can state the architecture rule in one sentence.
- [ ] I know what is **finished, partial, missing** (chat, RAG, XP not displayed, 1 playable lesson type out of 4, no search page).

## Stack and architecture

- [ ] I can list the stack with the major versions (Next 16, React 19, Nest 11, Prisma 7, Postgres 18, Redis 8, Socket.IO 4, Caddy 2).
- [ ] I can draw the container diagram and Caddy's routing.
- [ ] I can explain the two paths to the API (SSR and browser).
- [ ] I can explain why there is no CORS.

## Frontend

- [ ] Server vs Client Components, with an example of each in our project.
- [ ] The "change the goal" flow from the click to the display, other tabs included.
- [ ] How an API error becomes a translated message.
- [ ] The `[locale]` routing, the route groups, `proxy.ts`.

## Backend

- [ ] The pipeline of a request (middlewares, guards, pipes, controller, service, filter).
- [ ] Private by default and `@Public()`.
- [ ] The rate limits (100/min, 10 signup, 5 login/2FA, 10 friend requests).
- [ ] `lockCourse` and why.

## Database

- [ ] I can draw the ERD (10 tables) and list the special keys (`pairKey`, composite PKs, `@@unique([userId, lang])`).
- [ ] The life of a `LessonResult`.
- [ ] What the seed does (3,990 lessons, 216 ready, 270 questions).

## Authentication

- [ ] Sessions vs JWT, and our choice.
- [ ] Login with 2FA: `202`, `pendingUserId`, `verify`, regeneration.
- [ ] The defenses: argon2id, dummy hash, throttler, `httpOnly`, `SameSite=Lax`, regeneration, re-reading the user.

## Features

- [ ] Walk through the placement test on an example.
- [ ] Explain why you cannot cheat on a lesson.
- [ ] The score calculation (35/65, 0.5 for spelling, 70 to pass).
- [ ] The streak and the time zone.
- [ ] XP, ranks, the challenge, achievements (and the fact that they are not displayed).
- [ ] Where AI comes in (restocking + offline authoring).

## Real time

- [ ] The authenticated handshake.
- [ ] The 6 events and their recipients.
- [ ] Presence (counter, 10 s, accepted friends).
- [ ] Reconnection without console errors.

## Infra, tests, decisions

- [ ] What `make` does, step by step.
- [ ] The 4 Compose files, the 4 workflows.
- [ ] Deployment via a systemd timer.
- [ ] The 3 levels of tests, the console gate.
- [ ] 3 technical decisions defended **with their drawbacks**.

## D-Day

- [ ] I have done at least 2 mock exams ([16](16-MOCK-EXAM.md)), including one at level 5.
- [ ] I re-read [15 E](15-ORAL-EXAM-PREPARATION.md#e-trick-questions) (trick questions) in the morning.
- [ ] If I don't know: "I'm not sure, let me check in the code" and I open the file.
