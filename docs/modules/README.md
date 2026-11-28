# Modules

A module is a feature from the subject's module list (chapter IV). Each one is worth points:
a **Major** module is 2 points and a **Minor** module is 1 point. The project needs **14 points**.
Points above 14 are a bonus, and the bonus is **capped at 5**, so at most **19 points count**
([../subject/summary.md](../subject/summary.md), "Modules: 14 points required" and "Bonus"). A
module that does not work at the evaluation counts as 0, so we claim more than 19 to keep a
margin.

Each claimed module has its own file in this folder. Every file has the same headings, from
[\_template.md](_template.md): what the subject asks, how we meet it, how it works, where the code
is, how to show it at the defence, the tests, the limits, and who built it.

## Claimed modules

| Module                                                                | Type           | Points | What we built                                                                                                                                                                                      |
| --------------------------------------------------------------------- | -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Framework for frontend and backend](framework.md)                    | Major          | 2      | The web app is built with Next.js (based on React), the API with NestJS                                                                                                                            |
| [ORM for the database](orm.md)                                        | Minor          | 1      | The API reads and writes PostgreSQL through Prisma 7, with typed queries instead of hand-written SQL                                                                                               |
| [Standard user management](user-management.md)                        | Major          | 2      | A profile to edit, an avatar to upload or remove (with a default), friends with live online status, and a profile page for every user                                                              |
| [Complete 2FA](two-factor-auth.md)                                    | Minor          | 1      | A six-digit code from an authenticator app at every login, ten single-use recovery codes, and a way to turn it off                                                                                 |
| [User interaction: chat, profiles and friends](user-interaction.md)   | Major          | 2      | Friend requests, profile pages, and private messages between friends that arrive live, are stored, and show an unread count                                                                        |
| [Real-time features via WebSockets](websockets.md)                    | Major          | 2      | One socket.io connection per tab on `/ws` pushes new messages, friend requests, online status and course changes without a reload                                                                  |
| [Complete LLM interface](llm-interface.md)                            | Major          | 2      | A lesson tutor whose answer streams word by word, and new placement questions written in the background, with clear errors and rate limits                                                         |
| [Internationalization: 3 languages](i18n.md)                          | Minor          | 1      | The whole site in English, French and German, with a language menu and the language in the address (`/en/...`, `/fr/...`, `/de/...`)                                                               |
| [Support for 2 additional browsers](browsers.md)                      | Minor          | 1      | Every browser test runs on Chromium, Firefox and WebKit (the engine behind Safari), on every pull request                                                                                          |
| [Server-Side Rendering](ssr.md)                                       | Minor          | 1      | The server sends full pages with their content, so they still show it with JavaScript turned off                                                                                                   |
| [Advanced search](advanced-search.md)                                 | Minor          | 1      | The all lessons page: search by words, filters, sorting, grouping and pages, each view a shareable address                                                                                         |
| [Gamification](gamification.md)                                       | Minor          | 1      | XP and ranks, a daily challenge and 16 achievements, stored per course                                                                                                                             |
| [Monitoring with Prometheus and Grafana](monitoring.md)               | Major          | 2      | Prometheus collects metrics from the app, the databases and the server; Grafana shows four dashboards behind a login; alert rules can send to Discord                                              |
| [CI/CD](custom-ci-cd.md)                                              | Major (custom) | 2      | Checks on every pull request, a locked merge button until they pass and a teammate approves, multi-architecture images, and a server that updates itself                                           |
| [Cloud deployment with DNS and Let's Encrypt](custom-cloud-deploy.md) | Minor (custom) | 1      | The app runs at <https://trans.vyantares.ch> (the primary) and on an Oracle Cloud server at <https://transcendence.dpdns.org> (a copy), each with a Let's Encrypt certificate every browser trusts |

**Total: 22 points**: 7 Major modules (14 points) and 8 Minor modules (8 points). At most 19
count: the 14 required and the 5-point bonus. The other 3 points are the margin in case a module is
not accepted on the day.

The two custom modules are not in the subject's list. The subject asks the README to justify them
(why we chose them, the technical challenges, the value they add, and why they deserve their size).
That justification is in the [root README](../../README.md#modules), summarised from the last
sections of [custom-ci-cd.md](custom-ci-cd.md) and
[custom-cloud-deploy.md](custom-cloud-deploy.md).

### Gamification outside a game

Gamification is in the subject's gaming chapter (IV.6), and our product is a language-learning app,
not a game. But the subject suggests it for exactly our kind of app: in chapter V.6, the "Language
Learning Platform" has "Suggested modules: User interaction, Gamification, Multiple languages,
Voice integration, Analytics dashboard". It is suggested for the Fitness Tracker (V.5) and the
Forum Platform (V.3) too, and neither is a game. Its neighbours in IV.6 (Tournament, Game
customization, Spectator mode) each say they require a game. Gamification does not, and the
subject's dependency rule does not list it: "Gaming modules (AI Opponent, Tournament, Game
customization, Spectator mode, Multiplayer 3+, Add another game) require that at least one game be
implemented first." So we claim it, and the rewarded actions are finishing lessons and reaching the daily
goal. This is our reading of the subject. The full
argument is in [gamification.md](gamification.md).

## Not claimed

These modules are in the subject's list, and we do not claim them. Each reason was checked in the
code.

| Module                               | Type  | Why we do not claim it                                                                                                                                                                                                    |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete RAG system                  | Major | Dropped. pgvector is still in the database image ([compose.yml](../../compose.yml)), but no table holds documents or embeddings ([data-model.md](../architecture/data-model.md) §9)                                       |
| Custom design system                 | Minor | The subject asks for at least 10 reusable components. [packages/ui](../../packages/ui/src/components) has three: `Button`, `Card` and `ProgressBar`                                                                       |
| Notification system                  | Minor | The subject asks for notifications on every create, update and delete action. We push only messages, friend events, online status and course changes ([websockets.md](websockets.md))                                     |
| Progressive Web App                  | Minor | No web app manifest and no service worker: [apps/web/public](../../apps/web/public) holds only `logo.webp` and `robots.txt`                                                                                               |
| Remote authentication with OAuth 2.0 | Minor | Sign-in is email and password only, with 2FA; there is no OAuth code in the API                                                                                                                                           |
| Public API                           | Major | The API has Swagger docs at `/api/docs` ([app.setup.ts](../../apps/api/src/app.setup.ts)) and rate limits, but no API keys: a client signs in with the session cookie                                                     |
| File upload and management           | Minor | Avatar upload exists, as part of [user management](user-management.md): PNG, JPEG or WebP, 2 MiB at most, checked on both sides. The module asks for more: several file types, preview, progress, and managing many files |
| Full WCAG 2.1 AA compliance          | Major | No accessibility audit or automated accessibility tests have been done                                                                                                                                                    |
| RTL support                          | Minor | The three languages (English, French, German) are all written left to right ([i18n.md](i18n.md))                                                                                                                          |
| User activity analytics dashboard    | Minor | No dashboard of user activity is built; the old plan's `DailyStat` and `Mistake` tables were dropped ([data-model.md](../architecture/data-model.md) §9)                                                                  |

We also do not claim the other modules of the list, and did not build them: the other gaming
modules and Game statistics (they all require a game), Advanced chat, Real-time collaborative features, Advanced
permissions, Organization system, the other AI modules (Recommendation system, Content moderation,
Voice/speech, Sentiment analysis, Image recognition), WAF and Vault, ELK, microservices, Health
check and status page, Advanced analytics dashboard, Data export and import, GDPR compliance, and
the two blockchain modules. The Minor frontend and backend framework modules are not claimed
either: the Major framework module above already covers both.
