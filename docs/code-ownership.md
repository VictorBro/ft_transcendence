# Qui a touché quoi

Ce fichier dit, pour chaque personne, **quels fichiers elle a touchés** et dans quelles PR. Il sert de
point de départ pour écrire son dossier dans [transcendence-course/](transcendence-course/README.md) :
chaque dossier doit couvrir le code de cette liste.

## Comment c'est calculé

- On part des 91 PR fusionnées sur `main`, plus les commits de la branche `docs/152-docs-rework`
  (pas encore fusionnée).
- Les PR sont squashées, donc le commit sur `main` porte un seul nom. Pour savoir qui a vraiment écrit
  quoi, on relit **les commits d'origine de chaque PR** (`refs/pull/N/head`). Un fichier compte pour une
  personne si un de ses commits d'origine l'a modifié et que le changement est resté dans le squash.
- Les commits signés `Claude` ou `Copilot` comptent pour l'auteur de la PR (c'est lui qui pilotait).
- Seuls les fichiers qui existent aujourd'hui sont listés. Les fichiers renommés sont suivis jusqu'à leur
  nom actuel.
- « Touché » veut dire créé ou modifié, même d'une ligne. Ce n'est pas un pourcentage de lignes.
- Entre parenthèses : les autres personnes qui ont aussi touché le fichier.
- Les dossiers de données (`content/`, `docs/mockups`, `docs/brand`, fixtures...) sont donnés en
  nombre de fichiers.

Pour refaire le calcul : `git fetch origin '+refs/pull/*/head:refs/pr/*'`, puis pour chaque commit
`(#N)` de `main`, comparer `git show --name-only` du squash avec les commits de
`git log --no-merges refs/pr/N --not <squash>^`.

## Les personnes

| Personne | GitHub | Identités Git | Dossier |
| --- | --- | --- | --- |
| Victor | `VictorBro` | `VictorBro <vmb1111@…>` | [victor/](transcendence-course/victor/README.md) |
| Endrit | `VYAntares` | `VYAntares`, `EA` (même email), `eahmeti` (login 42) | [endrit/](transcendence-course/endrit/README.md) |
| Bastian | `bastian-schnitzler` | `bastian-schnitzler`, `Bastian Schnitzler`, `Bastian`, `baschni`, `Heinz Ruehman` (même email `baschni@…`) | [bastian/](transcendence-course/bastian/README.md) |
| Anaïs | `avarrett` | `ninisse <avarretta@…>` | [anais/](transcendence-course/anais/README.md) |
| Luca | `luca-mattei` | `luca-mattei`, `lumattei`, `Luca Mattei` (même email `luca@…`) | [luca/](transcendence-course/luca/README.md) |

## En un coup d'œil

| Personne | PR (auteur) | PR (a aidé) | Fichiers touchés | dont code (`apps`, `packages`, `e2e`) |
| --- | ---: | ---: | ---: | ---: |
| Victor | 23 | 11 | 559 | 333 |
| Endrit | 27 | 5 | 746 | 261 |
| Bastian | 21 | 1 | 212 | 165 |
| Anaïs | 9 | 0 | 86 | 77 |
| Luca | 11 | 0 | 171 | 159 |

## Victor (`VictorBro`)

### Ses PR

- #2 chore: project scaffold
- #3 feat(api): add persistence layer and db-backed health
- #5 feat: add two-factor authentication and the auth UI
- #23 ci: add local git hooks, boundary check and pr title lint
- #24 feat: add the item bank with schema, validation and an english set
- #27 refactor(web): tidy the i18n shell, footers and dead styles
- #55 docs: record the onboarding and placement decisions
- #64 feat(web): course home, switcher, and drop the invented modes
- #65 ci: deployment stack and the tooling image it needs
- #66 feat: add cd part of ci/cd
- #72 fix(web): only the course home records the course
- #99 feat(web): land learners on their course, guard onboarding
- #119 feat: 89 en outlines A1 to C2
- #122 feat: 88 de outlines A1 to C2
- #130 feat: monitoring with prometheus, grafana and alertmanager (#129)
- #131 feat: deploy behind an existing reverse proxy
- #181 feat: #154 websocket gateway and live course updates
- #189 feat: #155 friends, and one e2e job per browser
- #193 feat: #156 public profiles and recently active learners
- #194 docs: #146 lesson screens from the prototype
- #198 perf: #61 faster checks and current versions
- #200 feat: #158 direct messages between friends
- #210 fix(devcontainer): open and pass make on rootless Docker without sudo
- premier commit du repo (`Initial commit`, sans PR)

A aussi écrit des commits dans les PR des autres :

- #20 Feat/chat home frontend
- #29 feat: onboarding db migration with eval
- #42 feat: avatar upload
- #58 feat(api): seed the question bank from content/items (#43)
- #59 feat(shared): course and placement contracts
- #60 feat(api): courses api for languages, levels and daily goals
- #67 feat: 49 onboarding
- #69 feat(api): generate questions when pool runs dry (#54)
- #71 feat: 48 placement exam api
- #104 feat: 50 placement and result
- #107 feat: 105 fr outline A1

### Ses fichiers (559)

#### API (`apps/api`)

- `apps/api/` : `.dockerignore`, `.gitignore`, `Dockerfile` (Anaïs), `Dockerfile.dockerignore`, `eslint.config.mjs`, `nest-cli.dev.json`, `nest-cli.json`, `package.json` (Anaïs, Endrit, Bastian), `prisma.config.ts` (Endrit), `tsconfig.build.json`, `tsconfig.json` (Endrit), `vitest.config.e2e.mts` (Luca, Anaïs), `vitest.config.mts`
- `apps/api/prisma/` : `schema.prisma` (Endrit, Anaïs, Luca, Bastian), `seed.ts` (Endrit, Luca, Bastian, Anaïs)
- `apps/api/prisma/migrations/` : `20260807022236_init_user`, `20260809004816_two_factor`, `20261104003255_add_friendships`, `20261106181514_add_user_last_active_day`, `20261116224104_add_messages`, `20261118210619_add_message_unread_index`, `migration_lock.toml`
- `apps/api/scripts/` : `check-outlines.ts` (Endrit), `try-generation.ts` (Endrit)
- `apps/api/src/` : `app.module.ts` (Endrit, Anaïs, Bastian), `app.setup.ts` (Luca, Anaïs, Endrit), `main.ts`, `validation.pipe.ts` (Endrit)
- `apps/api/src/auth/` : `auth.controller.spec.ts`, `auth.controller.ts` (Luca, Bastian, Anaïs, Endrit), `auth.decorators.ts`, `auth.dto.ts`, `auth.guard.spec.ts`, `auth.guard.ts` (Endrit), `auth.module.ts`, `auth.service.spec.ts` (Luca), `auth.service.ts` (Luca), `session.d.ts`, `two-factor.service.spec.ts` (Endrit), `two-factor.service.ts` (Luca, Endrit)
- `apps/api/src/courses/` : `courses.controller.ts` (Anaïs, Endrit, Luca), `courses.module.ts` (Anaïs, Bastian), `courses.service.spec.ts` (Anaïs, Luca), `courses.service.ts` (Anaïs, Endrit, Luca)
- `apps/api/src/demo/` : `demo.ts` (Endrit, Bastian)
- `apps/api/src/friends/` : `friend-ids.ts` (Endrit), `friends.controller.ts`, `friends.dto.ts`, `friends.module.ts` (Endrit), `friends.service.spec.ts` (Endrit), `friends.service.ts` (Endrit), `pair.ts`
- `apps/api/src/gateway/` : `gateway.module.ts` (Endrit), `session-io.adapter.ts`, `socket-exception.filter.spec.ts`, `socket-exception.filter.ts`, `socket.gateway.spec.ts` (Endrit), `socket.gateway.ts` (Endrit), `sockets.service.spec.ts`, `sockets.service.ts`
- `apps/api/src/health/` : `health.controller.spec.ts`, `health.controller.ts`, `health.module.ts`, `health.service.spec.ts`, `health.service.ts`
- `apps/api/src/health/dto/` : `health-response.dto.ts`
- `apps/api/src/items/` : `item-files.spec.ts` (Endrit)
- `apps/api/src/lessons/` : `goal.ts` (Luca), `lessons.service.ts` (Endrit, Luca, Bastian, Anaïs), `outline-files.spec.ts` (Bastian)
- `apps/api/src/llm/` : `GEMINI_PROVIDER.md` (Endrit, Luca), `fixture.provider.spec.ts` (Endrit, Luca), `fixture.provider.ts` (Endrit, Luca), `gemini.provider.spec.ts` (Endrit, Luca), `gemini.provider.ts` (Endrit, Luca), `llm.factory.spec.ts` (Endrit, Luca), `llm.factory.ts` (Endrit, Luca), `llm.module.spec.ts` (Endrit), `llm.module.ts` (Endrit), `llm.provider.ts` (Endrit, Luca)
- `apps/api/src/messages/` : `messages.controller.ts`, `messages.dto.ts`, `messages.gateway.ts`, `messages.module.ts`, `messages.service.spec.ts`, `messages.service.ts`, `unread.spec.ts`, `unread.ts`
- `apps/api/src/metrics/` : `http-metrics.middleware.spec.ts`, `http-metrics.middleware.ts`, `metrics-server.spec.ts`, `metrics-server.ts`, `metrics.collector.spec.ts`, `metrics.collector.ts`, `metrics.module.ts`, `metrics.spec.ts` (Anaïs), `metrics.ts` (Anaïs, Luca)
- `apps/api/src/placement/` : `placement-progress.service.spec.ts` (Bastian), `placement-progress.service.ts` (Bastian), `placement-question.service.spec.ts` (Bastian, Endrit), `placement-question.service.ts` (Bastian, Endrit), `placement-session.service.spec.ts` (Bastian), `placement-session.service.ts` (Bastian), `placement.module.ts` (Bastian, Endrit), `placement.schema.ts` (Bastian), `placement.service.spec.ts` (Bastian, Endrit), `placement.service.ts` (Bastian, Endrit)
- `apps/api/src/prisma/` : `prisma.module.ts`, `prisma.service.spec.ts`, `prisma.service.ts`
- `apps/api/src/question-generation/` : `QUESTION_GENERATION.md` (Endrit), `question-batch.spec.ts` (Endrit), `question-batch.ts` (Endrit), `question-generation.module.ts` (Endrit), `question-stock.service.spec.ts`, `question-stock.service.ts` (Endrit)
- `apps/api/src/question-generation/prompts/` : `question-batch.prompt.spec.ts`, `question-batch.prompt.ts` (Endrit)
- `apps/api/src/redis/` : `redis.module.ts`, `redis.service.spec.ts`, `redis.service.ts` (Endrit)
- `apps/api/src/throttler/` : `identity-throttler.guard.spec.ts` (Endrit), `identity-throttler.guard.ts` (Endrit), `rate-limits.spec.ts`, `rate-limits.ts`, `throttle-by-ip.decorator.ts`
- `apps/api/src/users/` : `active-day.spec.ts`, `active-day.ts`, `public-user.ts`, `users.controller.ts` (Anaïs), `users.dto.ts`, `users.module.ts`, `users.service.spec.ts` (Luca), `users.service.ts` (Luca, Anaïs)
- `apps/api/test/` : `app.e2e-spec.ts`, `auth.e2e-spec.ts` (Luca), `courses.e2e-spec.ts` (Anaïs), `demo.e2e-spec.ts` (Endrit, Bastian), `error-codes.e2e-spec.ts` (Endrit, Bastian), `friends.e2e-spec.ts` (Endrit), `gateway.e2e-spec.ts` (Anaïs), `messages.e2e-spec.ts`, `metrics.e2e-spec.ts`, `metrics.fixtures.ts`, `placement.e2e-spec.ts` (Bastian), `placement.fixtures.ts`, `seed.e2e-spec.ts` (Endrit, Luca, Bastian, Anaïs), `socket.fixtures.ts`, `two-factor.e2e-spec.ts` (Endrit), `users.e2e-spec.ts` (Luca, Endrit)

#### Web (`apps/web`)

- `apps/web/` : `.dockerignore`, `Dockerfile`, `Dockerfile.dockerignore`, `eslint.config.mjs`, `next.config.ts` (Endrit, Luca, Bastian), `package.json` (Luca, Bastian, Endrit), `postcss.config.mjs`, `proxy.ts` (Luca), `tsconfig.json`, `vitest.config.mts` (Endrit)
- `apps/web/app/` : `globals.css` (Endrit, Luca, Bastian), `icon.svg`
- `apps/web/app/[locale]/` : `error.tsx` (Luca), `layout.tsx` (Luca), `not-found.tsx` (Luca)
- `apps/web/app/[locale]/(dashboard)/` : `layout.tsx` (Endrit, Luca)
- `apps/web/app/[locale]/(dashboard)/dashboard/` : `page.tsx` (Endrit, Luca)
- `apps/web/app/[locale]/(dashboard)/learn/` : `page.tsx`
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/` : `goal-picker.tsx` (Bastian, Endrit), `page.tsx` (Luca, Bastian, Anaïs, Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/placement/` : `page.tsx` (Anaïs), `placement-exam.tsx` (Anaïs), `question-screen.tsx` (Endrit), `result-screen.tsx` (Endrit), `start-screen.tsx`
- `apps/web/app/[locale]/(main)/` : `layout.tsx` (Endrit, Luca), `page.tsx` (Endrit, Luca)
- `apps/web/app/[locale]/(main)/friends/` : `friend-search.tsx`, `page.tsx` (Endrit)
- `apps/web/app/[locale]/(main)/login/` : `login-form.tsx` (Endrit, Luca)
- `apps/web/app/[locale]/(main)/onboarding/` : `choose-course.tsx` (Luca, Bastian), `choose-level.tsx` (Luca), `page.tsx` (Luca)
- `apps/web/app/[locale]/(main)/profile/` : `page.tsx` (Endrit, Luca, Anaïs)
- `apps/web/app/[locale]/(main)/profile/edit/` : `page.tsx` (Anaïs), `profile-form.tsx`
- `apps/web/app/[locale]/(main)/settings/2fa/` : `page.tsx` (Endrit, Luca), `two-factor-panel.tsx` (Endrit, Luca, Bastian)
- `apps/web/app/[locale]/(main)/signup/` : `signup-form.tsx` (Endrit, Luca)
- `apps/web/app/[locale]/(main)/users/[id]/` : `page.tsx` (Endrit)
- `apps/web/app/[locale]/(messages)/` : `layout.tsx`
- `apps/web/app/[locale]/(messages)/chat/` : `chat-thread.tsx`, `conversation-list.tsx`, `page.tsx`
- `apps/web/app/healthz/` : `route.ts` (Luca)
- `apps/web/app/healthz/api/` : `route.ts`
- `apps/web/app/healthz/upstream/` : `route.ts` (Endrit, Luca)
- `apps/web/components/` : `avatar.tsx` (Anaïs), `change-level.tsx` (Endrit), `connection-status.tsx` (Endrit), `course-switcher.tsx` (Endrit), `dashboard-nav.tsx` (Luca, Endrit), `form.tsx` (Luca, Endrit), `friend-buttons.tsx`, `header-nav.tsx` (Luca, Endrit), `language-switcher.tsx` (Luca, Endrit), `legal-article.tsx` (Endrit, Luca), `legal-footer.tsx` (Endrit, Luca), `level-picker.tsx`, `log-out-button.tsx` (Luca, Endrit), `message-link.tsx`, `presence-dot.tsx` (Endrit), `refresh-on.tsx`, `session-nav.tsx` (Luca, Anaïs, Endrit), `shell.tsx` (Luca, Endrit), `tab-socket.ts` (Endrit), `unread-badge.tsx`, `user-row.tsx` (Endrit)
- `apps/web/lib/` : `api.test.ts` (Endrit, Bastian, Luca), `api.ts` (Endrit, Bastian), `auth-client.test.ts` (Luca, Bastian), `auth-client.ts` (Luca, Anaïs, Bastian), `avatar.test.ts`, `avatar.ts`, `conversations-client.test.ts`, `conversations-client.ts`, `conversations.ts`, `course-path.ts`, `courses.test.ts`, `courses.ts`, `error-message.ts` (Luca, Anaïs), `friends-client.test.ts`, `friends-client.ts`, `friends.test.ts` (Endrit), `friends.ts`, `legal.test.ts` (Luca), `legal.ts` (Luca), `level.test.ts`, `level.ts`, `messages.test.ts` (Luca, Anaïs), `onboarding.test.ts` (Luca), `onboarding.ts` (Luca), `placement-client.test.ts` (Anaïs), `placement-schema.test.ts`, `reconnect.test.ts`, `reconnect.ts`, `send-message.test.ts`, `send-message.ts`, `session.test.ts` (Endrit, Bastian), `session.ts` (Endrit, Bastian), `thread.test.ts`, `thread.ts`, `unread.test.ts`, `unread.ts`
- `apps/web/lib/legal-content/` : `de.ts` (Luca, Endrit), `en.ts` (Luca, Endrit), `fr.ts` (Luca, Endrit)
- `apps/web/messages/` : `de.json` (Luca, Anaïs, Bastian, Endrit), `en.json` (Luca, Anaïs, Bastian, Endrit), `fr.json` (Luca, Anaïs, Bastian, Endrit)
- `apps/web/public/` : `logo.webp`, `robots.txt`

#### Code partagé (`packages/`)

- `packages/eslint-config/` : `base.js`, `eslint.config.js`, `nest.js`, `next.js`, `package.json`
- `packages/shared/` : `eslint.config.mjs`, `package.json`, `tsconfig.build.json` (Endrit, Bastian), `tsconfig.json` (Endrit), `vitest.config.mts` (Bastian)
- `packages/shared/src/` : `index.ts` (Endrit)
- `packages/shared/src/events/` : `index.ts`, `socket.test.ts` (Endrit), `socket.ts` (Endrit)
- `packages/shared/src/schemas/` : `course.ts` (Luca, Anaïs, Endrit), `errors.ts` (Luca, Anaïs, Bastian, Endrit), `friend.ts` (Endrit), `health.ts`, `index.ts` (Luca, Endrit, Bastian, Anaïs), `item.test.ts` (Endrit), `item.ts` (Endrit), `locale.ts` (Luca, Endrit), `message.ts`, `placement.ts` (Luca, Bastian, Endrit), `schemas.test.ts` (Luca, Bastian, Endrit, Anaïs), `two-factor.ts` (Luca, Endrit), `user.ts` (Luca, Endrit)
- `packages/tsconfig/` : `base.json`, `library.json`, `nest.json`, `nextjs.json`, `package.json`
- `packages/ui/` : `eslint.config.mjs`, `package.json`, `tsconfig.json`, `vitest.config.mts`
- `packages/ui/src/` : `index.ts` (Bastian)
- `packages/ui/src/components/` : `Button.tsx`, `Card.tsx`, `components.test.tsx` (Bastian)
- `packages/ui/src/lib/` : `cn.ts`

#### Tests navigateur (`e2e/`)

- `e2e/` : `eslint.config.mjs`, `package.json` (Bastian), `playwright.config.ts` (Bastian, Luca), `tsconfig.json`
- `e2e/support/` : `console-guard.ts` (Bastian, Luca), `layout.ts` (Luca, Bastian), `live.ts`, `routes.ts` (Endrit, Luca, Anaïs, Bastian), `session.ts` (Endrit, Luca, Bastian), `signup-budget.ts` (Bastian, Luca)
- `e2e/tests/` : `auth.spec.ts` (Endrit, Luca, Anaïs, Bastian), `avatar.spec.ts`, `console.spec.ts` (Luca), `course.spec.ts` (Luca, Endrit, Bastian), `dashboard.spec.ts` (Endrit, Luca, Bastian), `discussion.spec.ts` (Luca), `friends.spec.ts` (Endrit), `i18n.spec.ts` (Luca, Endrit), `landing.spec.ts` (Bastian), `layout.spec.ts` (Luca), `legal.spec.ts` (Endrit, Luca), `level-complete.spec.ts`, `live.spec.ts` (Bastian), `messages.spec.ts` (Endrit), `monitoring.spec.ts` (Endrit), `onboarding.spec.ts` (Luca, Bastian, Endrit), `placement.spec.ts` (Endrit, Anaïs, Bastian), `restart.spec.ts` (Endrit), `smoke.spec.ts` (Endrit, Luca), `today.spec.ts` (Bastian, Luca)

#### Contenu pédagogique (`content/`)

- `content/items/` : 9 fichiers (aussi : Endrit)
- `content/outlines/` : 13 fichiers (aussi : Bastian, Endrit)

#### Documentation (`docs/`)

- `docs/` : `backlog.md` (Endrit)
- `docs/architecture/` : `overview.md` (Endrit), `product.md` (Endrit, Anaïs), `technical-plan.md` (Endrit)
- `docs/content/` : `item-bank.md` (Endrit)
- `docs/mockups/` : 111 fichiers
- `docs/operations/` : `deployment.md` (Luca, Endrit), `development.md` (Bastian, Endrit), `monitoring.md` (Anaïs, Luca, Endrit), `versions.md` (Bastian, Endrit)
- `docs/site/` : 2 fichiers (aussi : Bastian, Endrit)
- `docs/subject/` : `ft_transcendence.pdf` (Endrit), `summary.md` (Endrit)

#### Infra, CI et racine du repo

- `.claude/skills/outline-language/` : `SKILL.md` (Endrit), `merge-plan.mjs`
- `.claude/workflows/` : `outline-language.js` (Endrit)
- `.devcontainer/` : `Dockerfile` (Bastian), `Dockerfile.dockerignore`, `bash-history.sh`, `devcontainer-lock.json`, `devcontainer.json` (Endrit), `docker-init.sh`, `initialize.sh`, `zshrc` (Bastian)
- `.devcontainer/features/bake-compat/` : `devcontainer-feature.json`, `install.sh`
- `.github/` : `CODEOWNERS` (Endrit), `commitlint.config.mjs` (Bastian), `pull_request_template.md` (Endrit)
- `.github/actions/setup/` : `action.yml`
- `.github/workflows/` : `ci.yml` (Luca, Anaïs, Endrit), `devcontainer.yml`, `e2e.yml` (Bastian), `hygiene.yml`, `images.yml` (Endrit)
- `.husky/` : `commit-msg`, `pre-commit` (Bastian), `pre-push`
- `.vscode/` : `extensions.json`, `settings.json`
- `/` : `.editorconfig`, `.env.example` (Endrit, Luca, Anaïs), `.gitattributes`, `.gitignore` (Endrit, Bastian), `.nvmrc`, `.prettierignore`, `.prettierrc`, `CONTRIBUTING.md`, `Makefile` (Bastian, Endrit, Luca), `README.md` (Endrit, Bastian, Luca), `compose.deploy.proxy.yml`, `compose.deploy.yml` (Endrit, Luca), `compose.override.yml` (Bastian), `compose.prod.yml`, `compose.yml` (Anaïs, Luca, Endrit), `package.json`, `pnpm-lock.yaml` (Luca, Anaïs, Bastian, Endrit), `pnpm-workspace.yaml` (Luca, Endrit), `turbo.json`
- `infra/caddy/` : `Caddyfile` (Bastian), `Caddyfile.prod` (Bastian)
- `infra/deploy/` : `.env.example` (Endrit, Luca), `deploy.sh`, `ft-deploy.service`, `ft-deploy.timer`
- `infra/monitoring/alertmanager/` : `Dockerfile`, `alertmanager.yml`, `entrypoint.sh`, `silent.yml`
- `infra/monitoring/alertmanager/templates/` : `discord.tmpl`
- `infra/monitoring/grafana/` : `Dockerfile` (Endrit), `entrypoint.sh`, `grafana.ini`
- `infra/monitoring/grafana/dashboards/` : 4 fichiers (aussi : Luca)
- `infra/monitoring/grafana/provisioning/dashboards/` : `dashboards.yml`
- `infra/monitoring/grafana/provisioning/datasources/` : `datasources.yml`
- `infra/monitoring/prometheus/` : `Dockerfile` (Endrit), `prometheus.yml`
- `infra/monitoring/prometheus/rules/` : `alerts.yml` (Endrit)
- `infra/monitoring/prometheus/tests/` : `alerts.test.yml` (Endrit)
- `scripts/` : `assert-ts-version.sh` (Anaïs, Endrit), `check-app-boundaries.sh`, `check-dev-env.sh`, `check-env-example.sh` (Endrit), `check-monitoring-config.sh`, `check-monitoring.sh`, `check-prisma-drift.sh`, `check-prisma-format.sh`, `playwright-in-image.sh`, `pr-title.sh`

## Endrit (`VYAntares`)

### Ses PR

- #20 Feat/chat home frontend
- #58 feat(api): seed the question bank from content/items (#43)
- #69 feat(api): generate questions when pool runs dry (#54)
- #111 chore(api): default gemini model to gemini-3.6-flash
- #121 feat: #90 french outlines A2 to C2
- #125 fix(web): #106 address French learners with tu
- #126 fix(api): #108 send an error code in every error message
- #128 feat: 81 today all search lessons
- #133 feat(docs): new branding
- #139 docs: #76 record the lesson, daily goal and streak decisions
- #140 feat(api): #134 seed the lessons from the outlines
- #142 feat(shared): #135 port the prototype's lesson schemas and validators
- #143 feat(api): #85 seed demo learners on development stacks
- #162 feat(shared): #136 make the lesson validators work for German and English
- #178 feat(api): #83 lessons:author writes and validates lessons with Claude Code
- #183 feat(content): #93 french briefs and lessons, a1 to c2
- #184 feat(content): #92 english briefs and lessons, a1 to c2
- #185 feat(content): #91 german briefs and lessons, a1 to c2
- #195 feat: #157 online status
- #202 test(e2e): #96 the roadmap and lesson loop on real lessons
- #203 feat(web): #148 the reading lesson
- #206 fix: #204 the privacy policy says what the platform does, on a free Gemini key
- #208 fix(shared): consistently address French learners with tu
- #214 fix(web): #213 render the tutor's Markdown and pick a natural Listen voice
- #218 fix(web): #217 check the 2FA turn-off password in the browser
- #219 fix: #216 refuse 2FA setup and enable while 2FA is on
- #220 fix(web): header menu, course cards and phone layouts
- branche `docs/152-docs-rework` (pas encore fusionnée) : réorganisation de `docs/`

A aussi écrit des commits dans les PR des autres :

- #24 feat: add the item bank with schema, validation and an english set
- #27 refactor(web): tidy the i18n shell, footers and dead styles
- #29 feat: onboarding db migration with eval
- #104 feat: 50 placement and result
- #107 feat: 105 fr outline A1

### Ses fichiers (746)

#### API (`apps/api`)

- `apps/api/` : `package.json` (Victor, Anaïs, Bastian), `prisma.config.ts` (Victor), `tsconfig.json` (Victor)
- `apps/api/prisma/` : `schema.prisma` (Victor, Anaïs, Luca, Bastian), `seed.ts` (Victor, Luca, Bastian, Anaïs)
- `apps/api/prisma/migrations/` : `20260913181513_add_user_levels_and_question_bank`, `20260913184446_question_bank_source_id_unique`, `20261024122424_add_lesson_content`
- `apps/api/scripts/` : `check-outlines.ts` (Victor), `try-generation.ts` (Victor)
- `apps/api/scripts/lessons/` : `author.ts`, `check-draft.ts`, `check.ts`, `complete.ts`, `edits.ts`, `files.ts`, `json.ts`, `prompt.ts`, `reply.ts`, `report.ts`, `times.ts`
- `apps/api/scripts/lessons/providers/` : `chat.ts`, `claude.ts`
- `apps/api/src/` : `app.module.ts` (Victor, Anaïs, Bastian), `app.setup.ts` (Victor, Luca, Anaïs), `error-code.filter.ts`, `validation.pipe.ts` (Victor)
- `apps/api/src/auth/` : `auth.controller.ts` (Victor, Luca, Bastian, Anaïs), `auth.guard.ts` (Victor), `two-factor.service.spec.ts` (Victor), `two-factor.service.ts` (Victor, Luca)
- `apps/api/src/courses/` : `courses.controller.ts` (Victor, Anaïs, Luca), `courses.service.ts` (Anaïs, Luca, Victor)
- `apps/api/src/demo/` : `demo.clock.ts`, `demo.data.ts`, `demo.planner.spec.ts` (Bastian), `demo.planner.ts`, `demo.ts` (Bastian, Victor)
- `apps/api/src/friends/` : `friend-ids.ts` (Victor), `friends.module.ts` (Victor), `friends.service.spec.ts` (Victor), `friends.service.ts` (Victor)
- `apps/api/src/gateway/` : `gateway.module.ts` (Victor), `socket.gateway.spec.ts` (Victor), `socket.gateway.ts` (Victor)
- `apps/api/src/items/` : `item-files.spec.ts` (Victor)
- `apps/api/src/lessons/` : `course-lookup.spec.ts` (Luca), `course-lookup.ts` (Bastian, Luca), `lesson-complete.spec.ts`, `lesson-edits.spec.ts`, `lesson-files.spec.ts` (Bastian), `lesson-search.spec.ts` (Luca), `lesson-search.ts` (Luca), `lessons.controller.ts` (Luca, Bastian, Anaïs), `lessons.dto.ts` (Luca, Anaïs), `lessons.module.ts` (Anaïs, Luca), `lessons.service.ts` (Luca, Bastian, Anaïs, Victor)
- `apps/api/src/llm/` : `GEMINI_PROVIDER.md` (Victor, Luca), `fixture.provider.spec.ts` (Victor, Luca), `fixture.provider.ts` (Victor, Luca), `gemini.provider.spec.ts` (Victor, Luca), `gemini.provider.ts` (Victor, Luca), `llm.factory.spec.ts` (Victor, Luca), `llm.factory.ts` (Victor, Luca), `llm.module.spec.ts` (Victor), `llm.module.ts` (Victor), `llm.provider.ts` (Victor, Luca)
- `apps/api/src/placement/` : `placement-question.service.spec.ts` (Victor, Bastian), `placement-question.service.ts` (Victor, Bastian), `placement.module.ts` (Bastian, Victor), `placement.service.spec.ts` (Victor, Bastian), `placement.service.ts` (Bastian, Victor)
- `apps/api/src/presence/` : `presence.module.ts`, `presence.service.spec.ts`, `presence.service.ts`
- `apps/api/src/question-generation/` : `QUESTION_GENERATION.md` (Victor), `question-batch.spec.ts` (Victor), `question-batch.ts` (Victor), `question-generation.module.ts` (Victor), `question-stock.service.ts` (Victor)
- `apps/api/src/question-generation/prompts/` : `question-batch.prompt.ts` (Victor)
- `apps/api/src/redis/` : `redis.service.ts` (Victor)
- `apps/api/src/throttler/` : `identity-throttler.guard.spec.ts` (Victor), `identity-throttler.guard.ts` (Victor)
- `apps/api/test/` : `demo.e2e-spec.ts` (Bastian, Victor), `error-codes.e2e-spec.ts` (Bastian, Victor), `friends.e2e-spec.ts` (Victor), `lessons.e2e-spec.ts` (Bastian, Luca), `seed.e2e-spec.ts` (Victor, Luca, Bastian, Anaïs), `two-factor.e2e-spec.ts` (Victor), `users.e2e-spec.ts` (Victor, Luca)
- `apps/api/test/fixtures/` : 4 fichiers

#### Web (`apps/web`)

- `apps/web/` : `next.config.ts` (Victor, Luca, Bastian), `package.json` (Victor, Luca, Bastian), `vitest.config.mts` (Victor)
- `apps/web/app/` : `globals.css` (Victor, Luca, Bastian), `lesson.css` (Bastian)
- `apps/web/app/[locale]/(dashboard)/` : `layout.tsx` (Victor, Luca)
- `apps/web/app/[locale]/(dashboard)/dashboard/` : `page.tsx` (Victor, Luca)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/` : `course-menu.tsx`, `direct-level-picker.tsx` (Bastian), `goal-picker.tsx` (Victor, Bastian), `page.tsx` (Victor, Luca, Bastian, Anaïs)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/` : `live-form.tsx` (Luca)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/play/` : `exam-timer.tsx` (Bastian), `player.tsx` (Bastian, Luca)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/placement/` : `question-screen.tsx` (Victor), `result-screen.tsx` (Victor)
- `apps/web/app/[locale]/(main)/` : `layout.tsx` (Victor, Luca), `page.tsx` (Victor, Luca)
- `apps/web/app/[locale]/(main)/friends/` : `page.tsx` (Victor)
- `apps/web/app/[locale]/(main)/login/` : `login-form.tsx` (Victor, Luca)
- `apps/web/app/[locale]/(main)/profile/` : `page.tsx` (Victor, Luca, Anaïs)
- `apps/web/app/[locale]/(main)/settings/2fa/` : `page.tsx` (Victor, Luca), `two-factor-panel.tsx` (Victor, Luca, Bastian)
- `apps/web/app/[locale]/(main)/signup/` : `signup-form.tsx` (Victor, Luca)
- `apps/web/app/[locale]/(main)/users/[id]/` : `page.tsx` (Victor)
- `apps/web/app/healthz/upstream/` : `route.ts` (Victor, Luca)
- `apps/web/components/` : `change-level.tsx` (Victor), `connection-status.tsx` (Victor), `course-switcher.tsx` (Victor), `dashboard-nav.tsx` (Victor, Luca), `form.tsx` (Victor, Luca), `gamification.tsx` (Anaïs), `header-menu.tsx`, `header-nav.tsx` (Victor, Luca), `language-switcher.tsx` (Luca, Victor), `legal-article.tsx` (Victor, Luca), `legal-footer.tsx` (Luca, Victor), `log-out-button.tsx` (Victor, Luca), `menu-icon.tsx`, `presence-dot.tsx` (Victor), `scroll-lock.ts`, `session-nav.tsx` (Victor, Luca, Anaïs), `shell.tsx` (Victor, Luca), `tab-socket.ts` (Victor), `user-row.tsx` (Victor)
- `apps/web/components/lesson/` : `controls.tsx` (Bastian), `countdown.tsx`, `discussion.tsx` (Luca), `speech.tsx` (Bastian), `tutor-answer.test.tsx`, `tutor-answer.tsx`
- `apps/web/components/lesson/kinds/` : `index.ts` (Bastian), `reading-start.tsx`, `reading.test.tsx`, `reading.tsx`, `vocabulary-start.tsx` (Bastian)
- `apps/web/lib/` : `api.test.ts` (Victor, Bastian, Luca), `api.ts` (Victor, Bastian), `clock.ts`, `course-menu-slot.ts`, `friends.test.ts` (Victor), `presence.test.ts`, `presence.ts`, `reading.test.ts`, `reading.ts`, `session.test.ts` (Victor, Bastian), `session.ts` (Victor, Bastian), `voice.test.ts`, `voice.ts`
- `apps/web/lib/legal-content/` : `de.ts` (Luca, Victor), `en.ts` (Victor, Luca), `fr.ts` (Luca, Victor)
- `apps/web/messages/` : `de.json` (Luca, Victor, Anaïs, Bastian), `en.json` (Luca, Victor, Anaïs, Bastian), `fr.json` (Luca, Victor, Anaïs, Bastian)

#### Code partagé (`packages/`)

- `packages/shared/` : `tsconfig.build.json` (Victor, Bastian), `tsconfig.json` (Victor)
- `packages/shared/src/` : `index.ts` (Victor)
- `packages/shared/src/events/` : `socket.test.ts` (Victor), `socket.ts` (Victor)
- `packages/shared/src/lessons/` : `index.ts` (Bastian, Luca), `validateLesson.test.ts`, `validateLesson.ts`
- `packages/shared/src/lessons/domain/` : `articles.ts`, `functionsLesson.ts` (Bastian), `lessonCopy.test.ts`, `lessonCopy.ts`, `readingLesson.ts`, `richText.test.ts`, `richText.ts`, `vocabularyAnswers.ts`, `vocabularyLesson.ts`
- `packages/shared/src/lessons/player/` : `copy.ts` (Bastian, Luca), `index.ts` (Bastian), `outline.test.ts` (Bastian), `view.ts` (Bastian)
- `packages/shared/src/lessons/player/kinds/` : `kind.ts` (Bastian), `reading.ts` (Bastian)
- `packages/shared/src/lessons/schemas/` : `artifactCommon.ts`, `artifacts.ts`, `functions.ts`, `grammar.ts`, `reading.ts`, `vocabulary.ts`
- `packages/shared/src/lessons/validation/` : `artifacts.test.ts`, `artifacts.ts`, `common.ts`, `functions.test.ts`, `functions.ts`, `grammar.ts`, `grammarLength.ts`, `issues.ts`, `reading.test.ts`, `reading.ts`, `vocabulary.ts`
- `packages/shared/src/schemas/` : `course.ts` (Luca, Anaïs, Victor), `errors.ts` (Luca, Victor, Anaïs, Bastian), `friend.test.ts`, `friend.ts` (Victor), `index.ts` (Victor, Luca, Bastian, Anaïs), `item.test.ts` (Victor), `item.ts` (Victor), `language.ts`, `lesson.test.ts` (Bastian, Anaïs, Luca), `lesson.ts` (Bastian, Anaïs, Luca), `locale.ts` (Victor, Luca), `placement.ts` (Victor, Luca, Bastian), `schemas.test.ts` (Victor, Luca, Bastian, Anaïs), `two-factor.ts` (Victor, Luca), `user.ts` (Victor, Luca)
- `packages/shared/test/fixtures/content/briefs/` : `fr-classroom-instructions.json`, `fr-classroom-objects.json`, `fr-negation-ne-pas.json`, `fr-verb-etre-present.json`
- `packages/shared/test/fixtures/content/lessons/` : `fr-negation-ne-pas.json`, `fr-verb-etre-present.json`
- `packages/shared/test/fixtures/samples/briefs/` : `fr-greetings-and-goodbyes.json`, `fr-negation-ne-pas.json`, `fr-ordering-at-a-cafe.json`, `fr-reading-a-text-message.json`, `fr-verb-etre-present.json`
- `packages/shared/test/fixtures/samples/lessons/` : `fr-greetings-and-goodbyes.json`, `fr-negation-ne-pas.json`, `fr-ordering-at-a-cafe.json`, `fr-reading-a-text-message.json`, `fr-verb-etre-present.json`
- `packages/shared/test/fixtures/samples/outlines/` : `fr-a1.json`

#### Tests navigateur (`e2e/`)

- `e2e/support/` : `lesson-play.ts` (Bastian, Luca), `menu.ts`, `routes.ts` (Victor, Luca, Anaïs, Bastian), `session.ts` (Victor, Luca, Bastian)
- `e2e/tests/` : `auth.spec.ts` (Victor, Luca, Anaïs, Bastian), `course.spec.ts` (Victor, Luca, Bastian), `dashboard.spec.ts` (Victor, Luca, Bastian), `friends.spec.ts` (Victor), `i18n.spec.ts` (Luca, Victor), `legal.spec.ts` (Victor, Luca), `locale.spec.ts` (Luca), `messages.spec.ts` (Victor), `monitoring.spec.ts` (Victor), `onboarding.spec.ts` (Victor, Luca, Bastian), `placement.spec.ts` (Victor, Anaïs, Bastian), `restart.spec.ts` (Victor), `roadmap.spec.ts`, `smoke.spec.ts` (Victor, Luca), `time-zone.spec.ts` (Luca, Bastian)

#### Contenu pédagogique (`content/`)

- `content/briefs/` : 216 fichiers (aussi : Bastian)
- `content/items/` : 9 fichiers (aussi : Victor)
- `content/lessons/` : 108 fichiers (aussi : Bastian)
- `content/outlines/` : 7 fichiers (aussi : Victor, Bastian)

#### Documentation (`docs/`)

- `docs/` : `README.md`, `backlog.md` (Victor), `index.html` (Bastian)
- `docs/architecture/` : `data-model.md`, `overview.md` (Victor), `product.md` (Victor, Anaïs), `realtime.md`, `technical-plan.md` (Victor)
- `docs/brand/` : 62 fichiers
- `docs/content/` : `item-bank.md` (Victor), `lessons.md` (Bastian, Anaïs)
- `docs/modules/` : `README.md`, `_template.md`, `advanced-search.md`, `browsers.md`, `custom-ci-cd.md`, `custom-cloud-deploy.md`, `framework.md`, `gamification.md`, `i18n.md`, `llm-interface.md`, `monitoring.md`, `orm.md`, `ssr.md`, `two-factor-auth.md`, `user-interaction.md`, `user-management.md`, `websockets.md`
- `docs/operations/` : `deployment.md` (Victor, Luca), `development.md` (Bastian, Victor), `monitoring.md` (Victor, Anaïs, Luca), `versions.md` (Victor, Bastian)
- `docs/site/` : 4 fichiers (aussi : Bastian, Victor, Anaïs)
- `docs/subject/` : `ft_transcendence.pdf` (Victor), `summary.md` (Victor)
- `docs/transcendence-course/` : `README.md`
- `docs/transcendence-course/anais/` : `README.md`
- `docs/transcendence-course/bastian/` : `README.md`
- `docs/transcendence-course/endrit/` : `README.md`
- `docs/transcendence-course/endrit/demo/` : `README.md`, `concepts.md`
- `docs/transcendence-course/endrit/error-codes/` : `README.md`
- `docs/transcendence-course/endrit/lessons-api/` : `README.md`, `request-lifecycle.md`
- `docs/transcendence-course/endrit/lessons-author/` : `README.md`, `concepts.md`
- `docs/transcendence-course/endrit/llm-question-generation/` : `README.md`, `prompt.md`, `providers.md`
- `docs/transcendence-course/endrit/seed/` : `README.md`
- `docs/transcendence-course/endrit/shared-lessons/` : `README.md`, `domain.md`, `questions-oral.md`, `schemas.md`, `validation.md`
- `docs/transcendence-course/endrit/throttler/` : `README.md`
- `docs/transcendence-course/luca/` : `README.md`
- `docs/transcendence-course/victor/` : `README.md`

#### Infra, CI et racine du repo

- `.claude/skills/author-lessons/` : `SKILL.md`
- `.claude/skills/outline-language/` : `SKILL.md` (Victor)
- `.claude/workflows/` : `outline-language.js` (Victor)
- `.devcontainer/` : `devcontainer.json` (Victor)
- `.github/` : `CODEOWNERS` (Victor), `pull_request_template.md` (Victor)
- `.github/workflows/` : `ci.yml` (Victor, Luca, Anaïs), `images.yml` (Victor)
- `/` : `.env.example` (Victor, Luca, Anaïs), `.gitignore` (Victor, Bastian), `Makefile` (Victor, Bastian, Luca), `README.md` (Victor, Bastian, Luca), `compose.deploy.yml` (Victor, Luca), `compose.yml` (Victor, Anaïs, Luca), `pnpm-lock.yaml` (Victor, Luca, Anaïs, Bastian), `pnpm-workspace.yaml` (Victor, Luca)
- `infra/deploy/` : `.env.example` (Victor, Luca)
- `infra/monitoring/grafana/` : `Dockerfile` (Victor)
- `infra/monitoring/prometheus/` : `Dockerfile` (Victor)
- `infra/monitoring/prometheus/rules/` : `alerts.yml` (Victor)
- `infra/monitoring/prometheus/tests/` : `alerts.test.yml` (Victor)
- `scripts/` : `assert-ts-version.sh` (Victor, Anaïs), `check-env-example.sh` (Victor)

## Bastian (`bastian-schnitzler`)

### Ses PR

- #31 ci: husky precommit and makefile devcontainer guard
- #57 feat: 45-generic_api_client
- #62 chore: add merged pr overview alias
- #71 feat: 48 placement exam api
- #102 docs: lessons data model page
- #103 feat(shared): lesson contracts and content checks (#77)
- #107 feat: 105 fr outline A1
- #112 docs: update doc pages
- #114 fix: rename to LessonDraftFile and to LessonDraftEntry, update docs
- #118 docs: update github pages
- #169 test(e2e): #159 run every suite on Firefox and WebKit
- #170 docs: refresh milestones 2 and 3 on the docs site
- #171 feat(content): #84 french a1 lessons and the ready flag
- #172 fix(api): #34 restore the signup limit to 10 a minute
- #173 fix(web): #153 wording on shipped pages
- #174 feat(shared): #144 the lesson player's plan, scoring and view shapes
- #175 feat(shared): #144 the attempt core and the page views
- #177 test(e2e): #176 make the second visit in a new tab
- #186 feat(web): #86 the daily goal page
- #192 feat(web): #146 the lesson page, the player and the grammar lesson
- #197 feat(web): #147 #149 the vocabulary and functions lessons

A aussi écrit des commits dans les PR des autres :

- #122 feat: 88 de outlines A1 to C2

### Ses fichiers (212)

#### API (`apps/api`)

- `apps/api/` : `package.json` (Victor, Anaïs, Endrit)
- `apps/api/prisma/` : `schema.prisma` (Victor, Endrit, Anaïs, Luca), `seed.ts` (Victor, Endrit, Luca, Anaïs)
- `apps/api/prisma/migrations/` : `20261028175100_add_lesson_ready`
- `apps/api/src/` : `app.module.ts` (Victor, Endrit, Anaïs)
- `apps/api/src/auth/` : `auth.controller.ts` (Victor, Luca, Anaïs, Endrit)
- `apps/api/src/courses/` : `courses.module.ts` (Anaïs, Victor)
- `apps/api/src/demo/` : `demo.planner.spec.ts` (Endrit), `demo.ts` (Endrit, Victor)
- `apps/api/src/lessons/` : `course-lookup.ts` (Endrit, Luca), `gamification.rules.spec.ts` (Anaïs), `gamification.rules.ts` (Anaïs), `lesson-files.spec.ts` (Endrit), `lessons.controller.ts` (Endrit, Luca, Anaïs), `lessons.service.ts` (Endrit, Luca, Anaïs, Victor), `outline-files.spec.ts` (Victor), `roadmap.rules.spec.ts` (Anaïs), `roadmap.rules.ts` (Anaïs)
- `apps/api/src/placement/` : `placement-progress.service.spec.ts` (Victor), `placement-progress.service.ts` (Victor), `placement-question.service.spec.ts` (Victor, Endrit), `placement-question.service.ts` (Victor, Endrit), `placement-session.service.spec.ts` (Victor), `placement-session.service.ts` (Victor), `placement.controller.ts`, `placement.dto.ts`, `placement.module.ts` (Endrit, Victor), `placement.schema.ts` (Victor), `placement.service.spec.ts` (Victor, Endrit), `placement.service.ts` (Victor, Endrit)
- `apps/api/src/throttler/` : `throttler-storage.spec.ts`
- `apps/api/test/` : `demo.e2e-spec.ts` (Endrit, Victor), `error-codes.e2e-spec.ts` (Endrit, Victor), `finish.e2e-spec.ts` (Luca, Anaïs), `lessons.e2e-spec.ts` (Endrit, Luca), `placement.e2e-spec.ts` (Victor), `seed.e2e-spec.ts` (Victor, Endrit, Luca, Anaïs)

#### Web (`apps/web`)

- `apps/web/` : `next.config.ts` (Victor, Endrit, Luca), `package.json` (Victor, Luca, Endrit)
- `apps/web/app/` : `globals.css` (Victor, Endrit, Luca), `lesson.css` (Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/` : `direct-level-picker.tsx` (Endrit), `goal-picker.tsx` (Victor, Endrit), `page.tsx` (Victor, Luca, Anaïs, Endrit), `start-level.tsx`, `today.tsx`
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/` : `lesson-actions.tsx`, `page.tsx`
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/play/` : `exam-timer.tsx` (Endrit), `page.tsx`, `player.tsx` (Luca, Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/results/` : `page.tsx` (Anaïs)
- `apps/web/app/[locale]/(main)/onboarding/` : `choose-course.tsx` (Luca, Victor)
- `apps/web/app/[locale]/(main)/settings/2fa/` : `two-factor-panel.tsx` (Victor, Endrit, Luca)
- `apps/web/components/lesson/` : `board.tsx`, `confirm-dialog.tsx`, `controls.tsx` (Endrit), `flashcards.tsx`, `gender-page.tsx`, `matching-pairs.tsx`, `navigation.tsx`, `results-review.tsx` (Anaïs), `rich-text.tsx`, `speech.tsx` (Endrit), `types.ts`, `units.tsx`
- `apps/web/components/lesson/kinds/` : `functions-start.tsx`, `functions.tsx`, `grammar-start.tsx`, `grammar.tsx`, `index.ts` (Endrit), `vocabulary-start.tsx` (Endrit), `vocabulary.tsx`
- `apps/web/lib/` : `api-client.test.ts`, `api-client.ts`, `api.test.ts` (Victor, Endrit, Luca), `api.ts` (Victor, Endrit), `auth-client.test.ts` (Victor, Luca), `auth-client.ts` (Victor, Luca, Anaïs), `lesson-client.test.ts`, `lesson-client.ts`, `lesson-cursor.ts`, `lesson-gap.test.ts`, `lesson-gap.ts`, `lesson-history.test.ts`, `lesson-history.ts`, `lesson-navigation.test.ts`, `lesson-navigation.ts`, `lesson.test.ts`, `lesson.ts`, `lessons.ts` (Luca), `localized.test.ts`, `localized.ts`, `result-part.test.ts`, `result-part.ts`, `result-score-tone.test.ts`, `result-score-tone.ts`, `serial-queue.test.ts`, `serial-queue.ts`, `session.test.ts` (Victor, Endrit), `session.ts` (Victor, Endrit), `use-course-save.ts`
- `apps/web/messages/` : `de.json` (Luca, Victor, Anaïs, Endrit), `en.json` (Luca, Victor, Anaïs, Endrit), `fr.json` (Luca, Victor, Anaïs, Endrit)

#### Code partagé (`packages/`)

- `packages/shared/` : `tsconfig.build.json` (Victor, Endrit), `vitest.config.mts` (Victor)
- `packages/shared/src/lessons/` : `index.ts` (Endrit, Luca)
- `packages/shared/src/lessons/domain/` : `functionsLesson.ts` (Endrit)
- `packages/shared/src/lessons/player/` : `articleHint.ts`, `attempt.test.ts` (Anaïs), `attempt.ts`, `copy.ts` (Luca, Endrit), `feedback.ts`, `fixtures.testing.ts`, `index.ts` (Endrit), `motherTongue.ts`, `outline.test.ts` (Endrit), `outline.ts`, `plan.test.ts` (Luca), `plan.ts`, `readingPlan.ts`, `redact.test.ts`, `redact.ts`, `score.test.ts`, `score.ts`, `view.test.ts`, `view.ts` (Endrit)
- `packages/shared/src/lessons/player/kinds/` : `contentFile.ts`, `functions.ts`, `grammar.ts`, `index.ts`, `kind.ts` (Endrit), `reading.ts` (Endrit), `vocabulary.ts`
- `packages/shared/src/schemas/` : `errors.ts` (Luca, Victor, Anaïs, Endrit), `index.ts` (Victor, Luca, Endrit, Anaïs), `lesson.test.ts` (Endrit, Anaïs, Luca), `lesson.ts` (Anaïs, Endrit, Luca), `placement.ts` (Victor, Luca, Endrit), `schemas.test.ts` (Victor, Luca, Endrit, Anaïs)
- `packages/ui/src/` : `index.ts` (Victor)
- `packages/ui/src/components/` : `ProgressBar.tsx`, `components.test.tsx` (Victor)

#### Tests navigateur (`e2e/`)

- `e2e/` : `package.json` (Victor), `playwright.config.ts` (Victor, Luca)
- `e2e/support/` : `console-guard.ts` (Victor, Luca), `layout.ts` (Luca, Victor), `lesson-play.ts` (Endrit, Luca), `routes.ts` (Victor, Endrit, Luca, Anaïs), `session.ts` (Victor, Endrit, Luca), `signup-budget.ts` (Victor, Luca)
- `e2e/tests/` : `auth.spec.ts` (Victor, Endrit, Luca, Anaïs), `course.spec.ts` (Victor, Luca, Endrit), `dashboard.spec.ts` (Victor, Endrit, Luca), `landing.spec.ts` (Victor), `layout-gate.spec.ts`, `lesson-regressions.spec.ts`, `lesson.spec.ts`, `live.spec.ts` (Victor), `onboarding.spec.ts` (Victor, Luca, Endrit), `placement.spec.ts` (Endrit, Victor, Anaïs), `signup-budget.spec.ts`, `time-zone.spec.ts` (Luca, Endrit), `today.spec.ts` (Victor, Luca)

#### Contenu pédagogique (`content/`)

- `content/briefs/` : 12 fichiers (aussi : Endrit)
- `content/lessons/` : 8 fichiers (aussi : Endrit)
- `content/outlines/` : 5 fichiers (aussi : Victor, Endrit)

#### Documentation (`docs/`)

- `docs/` : `index.html` (Endrit)
- `docs/content/` : `lessons.md` (Endrit, Anaïs)
- `docs/operations/` : `development.md` (Victor, Endrit), `versions.md` (Victor, Endrit)
- `docs/site/` : 4 fichiers (aussi : Endrit, Victor, Anaïs)

#### Infra, CI et racine du repo

- `.devcontainer/` : `Dockerfile` (Victor), `pr-commit-history.sh`, `pr-history.sh`, `zshrc` (Victor)
- `.github/` : `commitlint.config.mjs` (Victor)
- `.github/workflows/` : `e2e.yml` (Victor)
- `.husky/` : `pre-commit` (Victor)
- `/` : `.gitignore` (Victor, Endrit), `Makefile` (Victor, Endrit, Luca), `README.md` (Victor, Endrit, Luca), `compose.override.yml` (Victor), `pnpm-lock.yaml` (Victor, Luca, Anaïs, Endrit)
- `infra/caddy/` : `Caddyfile` (Victor), `Caddyfile.prod` (Victor)

## Anaïs (`avarrett`)

### Ses PR

- #29 feat: onboarding db migration with eval
- #42 feat: avatar upload
- #60 feat(api): courses api for languages, levels and daily goals
- #104 feat: 50 placement and result
- #120 feat(api): roadmap rules for the daily goal, streak and level #80
- #132 feat: #94 gamification rules and schemas
- #180 feat: 95 award xp
- #190 feat: 145 lesson attempts
- #199 feat: 97 gamification pages

### Ses fichiers (86)

#### API (`apps/api`)

- `apps/api/` : `Dockerfile` (Victor), `package.json` (Victor, Endrit, Bastian), `vitest.config.e2e.mts` (Victor, Luca)
- `apps/api/prisma/` : `schema.prisma` (Victor, Endrit, Luca, Bastian), `seed.ts` (Victor, Endrit, Luca, Bastian)
- `apps/api/prisma/migrations/` : `20260917234934_add_active_lang`, `20261103225542_add_lesson_attempt`, `20261107184854_add_gamification`
- `apps/api/src/` : `app.module.ts` (Victor, Endrit, Bastian), `app.setup.ts` (Victor, Luca, Endrit)
- `apps/api/src/auth/` : `auth.controller.ts` (Victor, Luca, Bastian, Endrit)
- `apps/api/src/courses/` : `courses.controller.ts` (Victor, Endrit, Luca), `courses.dto.ts`, `courses.module.ts` (Bastian, Victor), `courses.service.spec.ts` (Victor, Luca), `courses.service.ts` (Endrit, Luca, Victor)
- `apps/api/src/lessons/` : `attempt-ref.spec.ts`, `attempt-ref.ts`, `attempts.controller.ts`, `attempts.service.ts` (Luca), `gamification.rules.spec.ts` (Bastian), `gamification.rules.ts` (Bastian), `gamification.ts`, `goal.spec.ts` (Luca), `lessons.controller.ts` (Endrit, Luca, Bastian), `lessons.dto.ts` (Endrit, Luca), `lessons.module.ts` (Endrit, Luca), `lessons.service.ts` (Endrit, Luca, Bastian, Victor), `roadmap.rules.spec.ts` (Bastian), `roadmap.rules.ts` (Bastian)
- `apps/api/src/metrics/` : `metrics.spec.ts` (Victor), `metrics.ts` (Victor, Luca)
- `apps/api/src/users/` : `users.controller.ts` (Victor), `users.service.ts` (Victor, Luca)
- `apps/api/test/` : `attempts.e2e-spec.ts`, `attempts.fixtures.ts`, `courses.e2e-spec.ts` (Victor), `finish.e2e-spec.ts` (Luca, Bastian), `gamification.e2e-spec.ts`, `gateway.e2e-spec.ts` (Victor), `seed.e2e-spec.ts` (Victor, Endrit, Luca, Bastian)

#### Web (`apps/web`)

- `apps/web/app/[locale]/(dashboard)/learn/[lang]/` : `page.tsx` (Victor, Luca, Bastian, Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/achievements/` : `page.tsx`
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/results/` : `page.tsx` (Bastian)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/placement/` : `page.tsx` (Victor), `placement-exam.tsx` (Victor)
- `apps/web/app/[locale]/(main)/profile/` : `page.tsx` (Victor, Endrit, Luca)
- `apps/web/app/[locale]/(main)/profile/edit/` : `page.tsx` (Victor)
- `apps/web/components/` : `avatar.tsx` (Victor), `gamification.tsx` (Endrit), `session-nav.tsx` (Victor, Luca, Endrit)
- `apps/web/components/lesson/` : `results-review.tsx` (Bastian)
- `apps/web/lib/` : `achievements.ts`, `auth-client.ts` (Victor, Luca, Bastian), `error-message.ts` (Luca, Victor), `messages.test.ts` (Luca, Victor), `placement-client.test.ts` (Victor), `placement-client.ts`, `placement-schema.ts`, `xp-breakdown.test.ts`, `xp-breakdown.ts`
- `apps/web/messages/` : `de.json` (Luca, Victor, Bastian, Endrit), `en.json` (Luca, Victor, Bastian, Endrit), `fr.json` (Luca, Victor, Bastian, Endrit)

#### Code partagé (`packages/`)

- `packages/shared/src/lessons/player/` : `attempt.test.ts` (Bastian)
- `packages/shared/src/schemas/` : `course.ts` (Luca, Victor, Endrit), `errors.ts` (Luca, Victor, Bastian, Endrit), `gamification.test.ts`, `gamification.ts`, `index.ts` (Victor, Luca, Endrit, Bastian), `lesson.test.ts` (Bastian, Endrit, Luca), `lesson.ts` (Bastian, Endrit, Luca), `schemas.test.ts` (Victor, Luca, Bastian, Endrit)

#### Tests navigateur (`e2e/`)

- `e2e/support/` : `routes.ts` (Victor, Endrit, Luca, Bastian)
- `e2e/tests/` : `auth.spec.ts` (Victor, Endrit, Luca, Bastian), `gamification.spec.ts`, `placement.spec.ts` (Endrit, Victor, Bastian)

#### Documentation (`docs/`)

- `docs/architecture/` : `product.md` (Victor, Endrit)
- `docs/content/` : `lessons.md` (Endrit, Bastian)
- `docs/operations/` : `monitoring.md` (Victor, Luca, Endrit)
- `docs/site/` : 1 fichiers (aussi : Bastian, Endrit)

#### Infra, CI et racine du repo

- `.github/workflows/` : `ci.yml` (Victor, Luca, Endrit)
- `/` : `.env.example` (Victor, Endrit, Luca), `compose.yml` (Victor, Luca, Endrit), `pnpm-lock.yaml` (Victor, Luca, Bastian, Endrit)
- `scripts/` : `assert-ts-version.sh` (Victor, Endrit)

## Luca (`luca-mattei`)

### Ses PR

- #26 feat: add i18n in English, French and German
- #59 feat(shared): course and placement contracts
- #67 feat: 49 onboarding
- #75 fix(web): lay the app out for phone screens (#68)
- #109 feat: store the learner's time zone (#78)
- #123 feat(api): lesson tables, and seed the lessons on every stack (#79)
- #141 feat(api): #82 finish a lesson, meet the daily goal, keep the streak
- #196 feat: 87 all lessons
- #201 feat: 150 lesson discussion
- #205 feat: 151 discussion window
- #212 fix(web): #211 store the interface language in User.locale

### Ses fichiers (171)

#### API (`apps/api`)

- `apps/api/` : `vitest.config.e2e.mts` (Victor, Anaïs)
- `apps/api/prisma/` : `schema.prisma` (Victor, Endrit, Anaïs, Bastian), `seed.ts` (Victor, Endrit, Bastian, Anaïs)
- `apps/api/prisma/migrations/` : `20261003124401_add_user_time_zone`, `20261007134739_add_lessons`
- `apps/api/src/` : `app.setup.ts` (Victor, Anaïs, Endrit)
- `apps/api/src/auth/` : `auth.controller.ts` (Victor, Bastian, Anaïs, Endrit), `auth.service.spec.ts` (Victor), `auth.service.ts` (Victor), `two-factor.service.ts` (Victor, Endrit)
- `apps/api/src/courses/` : `courses.controller.ts` (Victor, Anaïs, Endrit), `courses.service.spec.ts` (Victor, Anaïs), `courses.service.ts` (Anaïs, Endrit, Victor)
- `apps/api/src/lessons/` : `attempts.service.ts` (Anaïs), `course-lookup.spec.ts` (Endrit), `course-lookup.ts` (Endrit, Bastian), `discussion-limits.spec.ts`, `discussion-limits.ts`, `discussion-prompt.spec.ts`, `discussion-prompt.ts`, `discussion.controller.ts`, `discussion.service.ts`, `event-stream.spec.ts`, `event-stream.ts`, `goal.spec.ts` (Anaïs), `goal.ts` (Victor), `lesson-search.spec.ts` (Endrit), `lesson-search.ts` (Endrit), `lessons.controller.ts` (Endrit, Bastian, Anaïs), `lessons.dto.ts` (Endrit, Anaïs), `lessons.module.ts` (Endrit, Anaïs), `lessons.service.ts` (Endrit, Bastian, Anaïs, Victor)
- `apps/api/src/llm/` : `GEMINI_PROVIDER.md` (Endrit, Victor), `disabled.provider.spec.ts`, `disabled.provider.ts`, `fixture.provider.spec.ts` (Endrit, Victor), `fixture.provider.ts` (Endrit, Victor), `gemini.provider.spec.ts` (Endrit, Victor), `gemini.provider.stream.spec.ts`, `gemini.provider.ts` (Endrit, Victor), `llm.factory.spec.ts` (Victor, Endrit), `llm.factory.ts` (Victor, Endrit), `llm.provider.ts` (Victor, Endrit)
- `apps/api/src/metrics/` : `metrics.ts` (Victor, Anaïs)
- `apps/api/src/users/` : `users.service.spec.ts` (Victor), `users.service.ts` (Victor, Anaïs)
- `apps/api/test/` : `auth.e2e-spec.ts` (Victor), `discussion.e2e-spec.ts`, `finish.e2e-spec.ts` (Bastian, Anaïs), `lessons.e2e-spec.ts` (Endrit, Bastian), `seed.e2e-spec.ts` (Victor, Endrit, Bastian, Anaïs), `users.e2e-spec.ts` (Victor, Endrit)

#### Web (`apps/web`)

- `apps/web/` : `next.config.ts` (Victor, Endrit, Bastian), `package.json` (Victor, Bastian, Endrit), `proxy.ts` (Victor)
- `apps/web/app/` : `global-error.tsx`, `globals.css` (Victor, Endrit, Bastian)
- `apps/web/app/[locale]/` : `error.tsx` (Victor), `layout.tsx` (Victor), `not-found.tsx` (Victor)
- `apps/web/app/[locale]/(dashboard)/` : `layout.tsx` (Victor, Endrit)
- `apps/web/app/[locale]/(dashboard)/dashboard/` : `page.tsx` (Victor, Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/` : `page.tsx` (Victor, Bastian, Anaïs, Endrit)
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/` : `fold-details.tsx`, `lesson-list.tsx`, `live-form.tsx` (Endrit), `page.tsx`
- `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/play/` : `player.tsx` (Bastian, Endrit)
- `apps/web/app/[locale]/(main)/` : `layout.tsx` (Victor, Endrit), `page.tsx` (Victor, Endrit)
- `apps/web/app/[locale]/(main)/login/` : `login-form.tsx` (Victor, Endrit), `page.tsx`
- `apps/web/app/[locale]/(main)/onboarding/` : `choose-course.tsx` (Victor, Bastian), `choose-level.tsx` (Victor), `page.tsx` (Victor), `rocket.tsx`
- `apps/web/app/[locale]/(main)/privacy/` : `page.tsx`
- `apps/web/app/[locale]/(main)/profile/` : `page.tsx` (Victor, Endrit, Anaïs)
- `apps/web/app/[locale]/(main)/settings/2fa/` : `page.tsx` (Victor, Endrit), `two-factor-panel.tsx` (Victor, Endrit, Bastian)
- `apps/web/app/[locale]/(main)/signup/` : `page.tsx`, `signup-form.tsx` (Victor, Endrit)
- `apps/web/app/[locale]/(main)/terms/` : `page.tsx`
- `apps/web/app/[locale]/[...rest]/` : `page.tsx`
- `apps/web/app/healthz/` : `route.ts` (Victor)
- `apps/web/app/healthz/upstream/` : `route.ts` (Victor, Endrit)
- `apps/web/components/` : `dashboard-nav.tsx` (Victor, Endrit), `flag.tsx`, `form.tsx` (Victor, Endrit), `header-nav.tsx` (Victor, Endrit), `language-switcher.tsx` (Victor, Endrit), `legal-article.tsx` (Victor, Endrit), `legal-footer.tsx` (Endrit, Victor), `locale-sync.tsx`, `log-out-button.tsx` (Victor, Endrit), `session-nav.tsx` (Victor, Anaïs, Endrit), `shell.tsx` (Victor, Endrit), `time-zone-sync.tsx`
- `apps/web/components/lesson/` : `discussion.tsx` (Endrit)
- `apps/web/i18n/` : `navigation.ts`, `request.ts`, `routing.ts`
- `apps/web/lib/` : `api.test.ts` (Victor, Endrit, Bastian), `auth-client.test.ts` (Victor, Bastian), `auth-client.ts` (Victor, Anaïs, Bastian), `courses-client.test.ts`, `courses-client.ts`, `discussion-client.test.ts`, `discussion-client.ts`, `error-message.ts` (Victor, Anaïs), `legal.test.ts` (Victor), `legal.ts` (Victor), `lesson-list.test.ts`, `lesson-list.ts`, `lessons.ts` (Bastian), `messages.test.ts` (Victor, Anaïs), `onboarding.test.ts` (Victor), `onboarding.ts` (Victor)
- `apps/web/lib/legal-content/` : `de.ts` (Victor, Endrit), `en.ts` (Victor, Endrit), `fr.ts` (Victor, Endrit), `index.ts`
- `apps/web/messages/` : `de.json` (Victor, Anaïs, Bastian, Endrit), `en.json` (Victor, Anaïs, Bastian, Endrit), `fr.json` (Victor, Anaïs, Bastian, Endrit)

#### Code partagé (`packages/`)

- `packages/shared/src/lessons/` : `index.ts` (Endrit, Bastian)
- `packages/shared/src/lessons/player/` : `copy.ts` (Bastian, Endrit), `plan.test.ts` (Bastian)
- `packages/shared/src/schemas/` : `course.ts` (Anaïs, Victor, Endrit), `errors.ts` (Victor, Anaïs, Bastian, Endrit), `index.ts` (Victor, Endrit, Bastian, Anaïs), `lesson.test.ts` (Bastian, Endrit, Anaïs), `lesson.ts` (Bastian, Anaïs, Endrit), `locale.ts` (Victor, Endrit), `placement.ts` (Victor, Bastian, Endrit), `schemas.test.ts` (Victor, Bastian, Endrit, Anaïs), `two-factor.ts` (Victor, Endrit), `user.ts` (Victor, Endrit)

#### Tests navigateur (`e2e/`)

- `e2e/` : `playwright.config.ts` (Victor, Bastian)
- `e2e/support/` : `console-guard.ts` (Victor, Bastian), `layout.ts` (Victor, Bastian), `lesson-play.ts` (Bastian, Endrit), `routes.ts` (Victor, Endrit, Anaïs, Bastian), `session.ts` (Victor, Endrit, Bastian), `signup-budget.ts` (Bastian, Victor)
- `e2e/tests/` : `auth.spec.ts` (Victor, Endrit, Anaïs, Bastian), `console.spec.ts` (Victor), `course.spec.ts` (Victor, Endrit, Bastian), `dashboard.spec.ts` (Victor, Endrit, Bastian), `discussion.spec.ts` (Victor), `i18n.spec.ts` (Victor, Endrit), `layout.spec.ts` (Victor), `legal.spec.ts` (Victor, Endrit), `lessons.spec.ts`, `locale.spec.ts` (Endrit), `onboarding.spec.ts` (Victor, Bastian, Endrit), `smoke.spec.ts` (Victor, Endrit), `time-zone.spec.ts` (Bastian, Endrit), `today.spec.ts` (Bastian, Victor)

#### Documentation (`docs/`)

- `docs/operations/` : `deployment.md` (Victor, Endrit), `monitoring.md` (Victor, Anaïs, Endrit)

#### Infra, CI et racine du repo

- `.github/workflows/` : `ci.yml` (Victor, Anaïs, Endrit)
- `/` : `.env.example` (Victor, Endrit, Anaïs), `Makefile` (Victor, Bastian, Endrit), `README.md` (Victor, Endrit, Bastian), `compose.deploy.yml` (Victor, Endrit), `compose.yml` (Victor, Anaïs, Endrit), `pnpm-lock.yaml` (Victor, Anaïs, Bastian, Endrit), `pnpm-workspace.yaml` (Victor, Endrit)
- `infra/deploy/` : `.env.example` (Victor, Endrit)
- `infra/monitoring/grafana/dashboards/` : 1 fichiers (aussi : Victor)

