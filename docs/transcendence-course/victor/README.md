# Victor

What Victor (`VictorBro`) built, explained for the defence. The page in his own words is still to
come. Until then, the pages below already explain his code. Each module page has a "Who built it"
section, and [code-ownership.md](../../code-ownership.md) lists every file he touched.

## Modules

| Module | His part |
| --- | --- |
| [Complete 2FA](../../modules/two-factor-auth.md) | The whole module: the 2FA service and routes, the recovery codes, the login step, the settings page and the tests |
| [Real-time features via WebSockets](../../modules/websockets.md) | The gateway, rooms, the tab socket and its reconnect loop, the friend and direct message events (online status is Endrit's) |
| [User interaction](../../modules/user-interaction.md) | Friends, user search, public profiles and direct messages |
| [Standard user management](../../modules/user-management.md) | The first profile page and the display name rule, friends, user search, public profiles and "Recently active" (avatars are Anaïs's) |
| [Monitoring](../../modules/monitoring.md) | The whole module: Prometheus, Alertmanager, Grafana, the dashboards, the rules and their tests, the checks |
| [CI/CD](../../modules/custom-ci-cd.md) | Almost all of it: the workflows, the git hooks and checks, the `tooling` image, the automatic deploy |
| [Cloud deployment](../../modules/custom-cloud-deploy.md) | `compose.deploy.yml`, `Caddyfile.prod`, the runbook, and the overlay for a host behind another reverse proxy |
| [ORM](../../modules/orm.md) | Prisma in the scaffold, `PrismaService` with the pg adapter, the first migration, and the 2FA, friendship and message tables |
| [Framework](../../modules/framework.md) | The scaffold: the Next.js app, the NestJS app, the shared package, Caddy and compose |
| [Server-Side Rendering](../../modules/ssr.md) | Server components in the scaffold, the server-side session read, the course page and the friends pages |

## API guide

| Chapter | His code in it |
| --- | --- |
| [Chapter 3, infrastructure](../../api/03-infrastructure.md) | `prisma/`, `redis/`, `health/` and `metrics/`, and the per-address limit in `throttler/` (`ThrottleByIp`, `rate-limits.ts`) |
| [Chapter 5, auth and users](../../api/05-auth-and-users.md) | `auth/` with 2FA, and most of `users/` |
| [Chapter 9, social and real time](../../api/09-social-and-realtime.md) | `gateway/`, `friends/` and `messages/` (`presence/` is Endrit's) |
