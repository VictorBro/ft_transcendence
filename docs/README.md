# Project documentation

Where each topic lives, so every fact has one home. The repository's root
[README](../README.md) is the evaluation entry point; this folder holds the detail behind it.

## Start here

| If you want | Read |
|---|---|
| The product in one page, with the milestones and their issues | [index.html](index.html) (open it in a browser) |
| What the subject requires | [SUBJECT_SUMMARY.md](SUBJECT_SUMMARY.md), and the subject itself, [ft_transcendence.pdf](ft_transcendence.pdf) |
| To run the project locally | The root [README](../README.md), Instructions; shell shortcuts of the devcontainer in [DEVELOPMENT.md](DEVELOPMENT.md) |

## By topic

| Topic | Document | What it covers |
|---|---|---|
| **Product** | [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) | The learner journey, placement, the daily goal, the lesson as built, the claimed modules and points, REST, SSE and the socket, Redis, the AI layer, throttling, the data model |
| **Technical architecture** | [ARCHITECTURE.md](ARCHITECTURE.md) | The containers in production and development, Caddy's routes, a request through the stack, the WebSocket gateway, the lesson attempt and discussion routes, the tooling image, CI |
| | [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) | The stack and why, the repository layout, Docker stages, the Makefile, the five CI workflows, the build order and the risks |
| | [VERSIONS.md](VERSIONS.md) | What moves together and what is held back |
| **Data model** | [milestone1-data-model.html](milestone1-data-model.html) | Onboarding and placement: every format, spec against code |
| | [milestone2-data-model.html](milestone2-data-model.html) | Lessons: the lesson files, the seed, `Lesson`, `LessonAttempt`, the player views, the attempt and discussion APIs, gamification |
| | [milestone3-data-model.html](milestone3-data-model.html) | Real-time and social: socket events, friendships, messages, presence |
| | [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) §7 | Every table, in prose |
| **Lesson content and seeding** | [LESSONS.md](LESSONS.md) | Outlines, authored lessons, seeded and ready lessons, the authoring kit, the checks, scoring, the lesson pages, the mother tongue rule, the discussion step |
| | [ITEM_BANK.md](ITEM_BANK.md) | The placement question bank and how it is written |
| **Deployment** | [DEPLOYMENT.md](DEPLOYMENT.md) | The servers, DNS, the `.env`, what the seed loads, the LLM and rate-limit variables, automatic deploys |
| **Monitoring** | [MONITORING.md](MONITORING.md) | Prometheus, Grafana, the dashboards, the alerts, every metric |
| **Planning** | [BACKLOG.md](BACKLOG.md) | Work we know we owe, not scheduled yet |
| **Brand** | [brand/](brand/README.md) | The logo, its assets and the brand slides |

`gh-status.js` is not a document: the HTML pages load it to show live issue states from GitHub.

## Terms used throughout

| Term | Meaning |
|---|---|
| Course | One `UserLevel` row: a user learning one language, with a level, a daily goal and a streak |
| Outline entry | The plan of one lesson in `content/outlines/`. 3,990 in all |
| Seeded lesson | A `Lesson` row; there is one per outline entry |
| Ready lesson | A `Lesson` row with `ready = true`: its files exist and validate. 216 today, the first 12 of each language and level |
| Attempt | One `LessonAttempt` row: a learner playing one lesson, scored on the server |
| Discussion | The unscored page before a lesson's exam, where the learner talks with the LLM tutor over Server-Sent Events |
| Mother tongue | The language of an attempt's help text: the interface language, or another one when that is the course language |

Every count, route, variable and metric name in these documents is taken from the code on
`main`. When the code changes, the document that owns the topic changes in the same pull request.
