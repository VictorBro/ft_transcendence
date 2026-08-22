_This project has been created as part of the 42 curriculum by \<login1\>, \<login2\>, \<login3\>, \<login4\>, \<login5\>._

<!-- TODO: replace the placeholders above with the five 42 logins, in the order
     the team agrees. The subject requires this exact italicised first line. -->

# ft_transcendence

An AI-driven platform for learning a foreign language. Learners are placed at a
CEFR level by a short adaptive test, get a roadmap of topics for that level, and
work through each one with an AI tutor that explains, drills, and corrects every
answer with the mistakes named.

## Key features

<!-- TODO: keep this in step with what actually ships. -->

- Adaptive placement test that finds a learner's CEFR level and can be retaken
- A per-learner roadmap of topics, sized to a daily goal
- AI tutor: grounded explanations, generated exercises, corrections that name
  the mistake type
- Live practice and chat with other learners
- Progress tracking and analytics

---

## Team Information

All five members are **Developers**: everyone implements features, reviews code,
tests their work and documents it. On top of that, each holds a specialised role,
with a second holder so no area stalls when one person is unavailable.

| Member      | Role                            | Responsibilities                                                                                                         |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Bastian** | Product Owner, second Tech Lead | Product vision, backlog, feature priorities, validates completed work, talks to evaluators. Backs up technical decisions |
| **Victor**  | Technical Lead / Architect      | Architecture, stack decisions, code quality, reviews critical changes                                                    |
| **Endrit**  | Project Manager / Scrum Master  | Meetings and planning, progress and deadlines, team communication, risks and blockers                                    |
| **Anaïs**   | second Product Owner            | Shares backlog ownership and feature validation, covers the PO role                                                      |
| **Luca**    | second Project Manager          | Shares coordination and tracking, covers the PM role                                                                     |

## Project Management

<!-- TODO: fill in before the defence. The subject asks all three explicitly. -->

- **How work is organised:** TODO
- **Tools:** GitHub Issues, pull requests, CODEOWNERS review routing
- **Communication:** TODO

---

## Instructions

### Prerequisites

- Docker and Docker Compose
- `make`
- On Windows: WSL2, with the repository on the WSL2 filesystem

Node and pnpm are only needed to run things outside the containers; the versions
are pinned in `.nvmrc` and `package.json`.

### Run it

```bash
cp .env.example .env    # then edit the secrets, see the comments in that file
make                    # checks, build, run, browser tests
```

The app is served at <https://localhost>. `make` prints how to trust the local
TLS certificate. API documentation is at <https://localhost/api/docs>.

For day-to-day development use `make dev`, which starts the same stack with hot
reload. `make help` lists every target.

---

## Technical Stack

| Layer              | Choice                                    | Why                                                                                                                |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Frontend           | Next.js (App Router), React, Tailwind CSS | Server rendering, routing and a component model in one framework                                                   |
| Backend            | NestJS                                    | Dependency injection makes the AI provider mockable, plus guards, validation pipes, WebSocket gateways and Swagger |
| Database           | PostgreSQL with pgvector                  | Relational data and the RAG vector index in one datastore instead of two                                           |
| ORM                | Prisma                                    | Typed queries, and `schema.prisma` doubles as the schema documentation                                             |
| Cache and sessions | Redis                                     | Sessions, rate-limit counters, presence, AI response cache                                                         |
| Proxy              | Caddy                                     | One TLS entry point, one origin, so no CORS and httpOnly cookies just work                                         |
| Contracts          | Zod in `packages/shared`                  | One schema validates both the browser and the server                                                               |
| Tests              | Vitest, Supertest, Playwright             | Units, API integration, browser end to end                                                                         |

Full reasoning in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/PRODUCT_ARCHITECTURE.md](docs/PRODUCT_ARCHITECTURE.md).

---

## Database Schema

<!-- TODO: diagram plus tables and relations. The model is designed in
     docs/PRODUCT_ARCHITECTURE.md section 7; copy it here as it gets built. -->

TODO

## Features List

<!-- TODO: every implemented feature, what it does, and which member built it. -->

TODO

## Modules

<!-- TODO: every claimed module, Major = 2 / Minor = 1, the point total, a
     justification for each, how it was implemented and by whom. The planned
     set is in docs/PRODUCT_ARCHITECTURE.md section 2. -->

TODO

## Individual Contributions

<!-- TODO: per member, what they built, and the challenges they solved. -->

TODO

---

## Resources

<!-- TODO: references used, and a description of how AI was used, for which
     tasks and which parts of the project. The subject requires the AI part
     explicitly, and it is graded. -->

TODO

---

## Contributing

Branching, commit conventions, hooks and the pull request flow are in
[CONTRIBUTING.md](CONTRIBUTING.md).
