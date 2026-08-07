# ft_transcendence — Subject Summary

Condensed from `ft_transcendence.pdf` (42 subject, version 21.2, 31 pages).
This is a working reference — the PDF remains the authority.

## The project

Final Common Core project, **group of 4–5 people**. Unlike the old version, the content is
*your* choice: any real-world web app (Pong is now just one example among many).
Split into a **mandatory core** + **modules**.

## Team roles (mandatory)

- **Product Owner (PO)** — product vision, backlog, priorities, validates work, talks to stakeholders.
- **Project Manager / Scrum Master** — meetings, planning, progress tracking, risks and blockers.
- **Technical Lead / Architect** — architecture, stack decisions, code quality, reviews critical changes.
- **Developers** (all members) — implement features, review code, test, document.

With 4 people, one person can hold multiple roles. All roles must be documented in the
README, and each member must be able to explain the project and their own contribution
at evaluation.

Recommended (not mandatory): regular syncs, task tracking (GitHub Issues / Trello),
work breakdown, peer code review, decision notes, a chat channel.

## Mandatory part

- Web app with **frontend + backend + database**.
- Git with commits from **all** members, meaningful messages, visible work distribution.
- **Containerized** (Docker / Podman / equivalent), launched with a **single command**.
- Compatible with the latest stable **Google Chrome**.
- **No JS errors or warnings** in the browser console.
- Accessible **Privacy Policy** and **Terms of Service** pages — real content, reachable
  (e.g. footer links). Missing or placeholder pages = **project rejected**.
- **Multi-user simultaneous support**: concurrent logins, concurrent actions handled
  correctly, real-time updates propagated, no data corruption or race conditions.

### Technical requirements

- Frontend clear, responsive, accessible across devices.
- A CSS framework or styling solution (Tailwind, Bootstrap, MUI, Styled Components, …).
- Credentials in a local `.env` ignored by Git, plus a committed `.env.example`.
- Database with a clear schema and well-defined relations.
- Basic **user management**: signup + login, at minimum email/password with
  **hashed and salted** passwords. OAuth / 2FA come from modules.
- All forms and inputs validated **both frontend and backend**.
- **HTTPS** for every connection to the backend from outside. Internal container-to-container
  traffic (e.g. server ↔ database) may be unencrypted.

> Framework definition used by the subject: structured architecture + built-in features +
> full ecosystem. React, Vue, Angular, Svelte, Next.js are frameworks; Express, Fastify,
> NestJS, Django, Flask, Rails are frameworks. jQuery, Lodash, Axios are **not**.

## Modules — 14 points required

**Major = 2 points, Minor = 1 point.** Aiming above 14 is recommended, since a module that
isn't fully functional at evaluation counts as **0**.

### Dependency and compatibility rules

- Gaming modules (AI Opponent, Tournament, Game customization, Spectator mode,
  Multiplayer 3+, Add another game) require **at least one working game first**.
- Game Statistics requires a game.
- Advanced chat requires the basic chat from the "User interaction" module.
- **SSR is incompatible with the ICP blockchain backend.**

### Web

| Type | Module |
|---|---|
| Major | Framework for both frontend and backend (full-stack frameworks count as both) |
| Minor | Frontend framework |
| Minor | Backend framework |
| Major | Real-time features via WebSockets or similar (updates across clients, graceful dis/reconnect, efficient broadcasting) |
| Major | User interaction: basic **chat** + **profiles** + **friends** |
| Major | Public API: secured API key, rate limiting, docs, ≥5 endpoints (GET/POST/PUT/DELETE) |
| Minor | ORM for the database |
| Minor | Complete notification system for all create/update/delete actions |
| Minor | Real-time collaborative features (shared workspaces, live editing, …) |
| Minor | Server-Side Rendering (SSR) |
| Minor | Progressive Web App (offline support + installability) |
| Minor | Custom design system, ≥10 reusable components, palette, typography, icons |
| Minor | Advanced search: filters, sorting, pagination |
| Minor | File upload and management (multi-type, both-side validation, secure storage, preview, progress, delete) |

### Accessibility and Internationalization

| Type | Module |
|---|---|
| Major | Full WCAG 2.1 AA compliance: screen readers, keyboard nav, assistive tech |
| Minor | i18n with ≥3 complete languages, language switcher, all text translatable |
| Minor | RTL support: ≥1 RTL language, full layout mirroring, seamless LTR/RTL switching |
| Minor | ≥2 additional browsers fully supported, tested, documented |

### User Management

| Type | Module |
|---|---|
| Major | Standard user management: profile editing, avatar upload (with default), friends + online status, profile page |
| Minor | Game statistics and match history (**requires a game**): wins/losses/ranking/level, 1v1 history, achievements, leaderboard |
| Minor | Remote authentication with OAuth 2.0 (Google, GitHub, 42, …) |
| Major | Advanced permissions: user CRUD, roles (admin/user/guest/moderator), role-based views and actions |
| Major | Organization system: create/edit/delete orgs, add/remove members, org-scoped actions |
| Minor | Complete 2FA |
| Minor | User activity analytics and insights dashboard |

### Artificial Intelligence

| Type | Module |
|---|---|
| Major | AI opponent (**requires a game**): challenging, occasionally wins, human-like not perfect, supports game customization, must be explainable at evaluation |
| Major | Complete RAG system over a large dataset |
| Major | Complete LLM interface: text and/or image generation, streaming, error handling, rate limiting |
| Major | ML recommendation system: personalized, collaborative or content-based filtering, improves over time |
| Minor | Content moderation AI (auto moderation / deletion / warning) |
| Minor | Voice/speech integration |
| Minor | Sentiment analysis of user content |
| Minor | Image recognition and tagging |

### Cybersecurity

| Type | Module |
|---|---|
| Major | Hardened WAF/ModSecurity + HashiCorp Vault for secrets (encrypted and isolated) |

### Gaming and user experience

| Type | Module |
|---|---|
| Major | Complete web-based game, players vs players, clear rules and win/loss conditions, 2D or 3D |
| Major | Remote players on separate machines, latency and disconnection handling, reconnection logic |
| Major | Multiplayer 3+ players, fair mechanics, synchronization |
| Major | A second distinct game with history and matchmaking |
| Major | Advanced 3D graphics (Three.js, Babylon.js): immersive environment, advanced rendering, smooth performance |
| Minor | Advanced chat: blocking, game invites from chat, in-chat notifications, profile access, history, typing indicators and read receipts |
| Minor | Tournament system: brackets, matchup order, matchmaking, registration and management |
| Minor | Game customization: power-ups, maps/themes, settings, defaults available |
| Minor | Gamification: ≥3 of achievements / badges / leaderboards / XP / daily challenges / rewards, persisted, with visual feedback |
| Minor | Spectator mode with real-time updates (optional spectator chat) |

### DevOps

| Type | Module |
|---|---|
| Major | ELK log management (Elasticsearch + Logstash + Kibana), retention/archiving policies, secured access |
| Major | Prometheus + Grafana monitoring: exporters, custom dashboards, alerting rules, secured access |
| Major | Backend as microservices: loosely coupled, REST or message queues, single responsibility per service |
| Minor | Health check and status page with automated backups and disaster recovery |

### Data and Analytics

| Type | Module |
|---|---|
| Major | Advanced analytics dashboard: interactive charts, real-time updates, PDF/CSV export, date ranges and filters |
| Minor | Data export/import (JSON, CSV, XML), validated imports, bulk operations |
| Minor | GDPR compliance: data requests, confirmed deletion, readable export, confirmation emails |

### Blockchain

| Type | Module |
|---|---|
| Major | Tournament scores on-chain: Avalanche + Solidity on a test chain, contracts to record/manage/retrieve scores |
| Minor | ICP backend running on a blockchain (**incompatible with SSR**) |

### Modules of choice

| Type | Module |
|---|---|
| Major | Custom module, substantial and technically complex, justified in the README (why chosen, what challenges, what value, why 2 points). Trivial features = rejection |
| Minor | Same, smaller scope, still requires justification |

## Example 14-point build (Pong, from the subject)

- Gaming: web game (2) + remote players (2) + tournament (1) + customization (1) = **6**
- User Management: standard (2) + OAuth (1) = **3**
- Web: frameworks front+back (2) + ORM (1) = **3**
- AI: AI opponent (2) = **2**
- **Total: 14**

The subject also lists ~25 other project ideas across gaming, social/collaborative,
creative/media, productivity, and specialized niches — see chapter V of the PDF.

## README requirements

At the repo root, **in English**. Must contain:

- First line, italicized: *This project has been created as part of the 42 curriculum by \<login1\>[, \<login2\>, …]*
- **Description** — project name, goal, overview, key features.
- **Instructions** — prerequisites (software, tools, versions, `.env` setup) and step-by-step run instructions.
- **Resources** — references used **and how AI was used**, for which tasks and which parts of the project.

Additional sections required for this project:

- **Team Information** — each member's role(s) and responsibilities.
- **Project Management** — how work was organized, tools used, communication channels.
- **Technical Stack** — frontend, backend, database (and why), other libraries, justification of major choices.
- **Database Schema** — structure, tables/collections and relations, key fields and types.
- **Features List** — every implemented feature, who worked on it, what it does.
- **Modules** — all chosen modules, point calculation, justification for each (especially custom ones), how implemented, by whom.
- **Individual Contributions** — detailed per-member breakdown, challenges faced and how they were solved.

A poor or incomplete README hurts the evaluation.

## Bonus

Only considered once all 14 mandatory points are validated. Each extra module must be fully
functional, meet its description, add real value, and be justified in the README.
Major = 2, Minor = 1, **capped at 5 bonus points**.

## Submission and evaluation

- Only what's in the Git repository is evaluated — double-check file names.
- Every claimed module must be **demonstrated live**; non-functional or incomplete = 0 points.
- The team will be asked how roles were distributed, how work was organized and communicated,
  and what each member contributed.
- A **small live modification** of the project may be requested to verify real understanding
  (a behaviour tweak, a few lines of code, an easy feature) — doable in a few minutes.

## AI usage rules (chapter I)

- Use AI to reduce repetitive work and to develop prompting skills, not to outsource understanding.
- Only use AI-generated content you fully understand and can take responsibility for.
- Systematically check, review, question and test anything generated.
- Always seek peer review — being unable to explain your own code fails the evaluation.
