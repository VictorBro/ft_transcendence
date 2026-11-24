# Project documentation

This is the English documentation. The French translation is here: [docs-fr/](../docs-fr/README.md).

Where each topic lives, so every fact has one home. The repository's root
[README](../README.md) is the evaluation entry point; this folder holds the detail behind it.

GitHub Pages serves this folder from `main` at <https://victorbro.github.io/ft_transcendence/>, so
the HTML pages below can be read there without cloning the repository. [.nojekyll](.nojekyll) turns
Jekyll off, so the site serves every file as it is: a `.md` file comes back raw, `{{ }}` inside it
stays intact, and a name starting with `_` is not skipped.

## The folders

| Folder                                                  | The question it answers                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [api/](api/README.md)                                   | How does every file of `apps/api` work, explained from zero, chapter by chapter?    |
| [web/](web/README.md)                                   | How does every file of `apps/web` work, from React basics to each page?             |
| [modules/](modules/README.md)                           | Which modules do we claim, how many points, and how does each one meet the subject? |
| [architecture/](architecture/overview.md)               | How is the app built, and why?                                                      |
| [operations/](operations/deployment.md)                 | How do we run, deploy, monitor and update it?                                       |
| [content/](content/lessons.md)                          | What are the lessons and placement questions, and how are they written and loaded?  |
| [subject/](subject/summary.md)                          | What does the 42 subject require?                                                   |
| [transcendence-course/](transcendence-course/README.md) | What did each team member build, explained in their own words for the defence?      |
| [site/](site/milestone1-data-model.html)                | The pages and script behind the GitHub Pages site                                   |

## Every document

### At the root

| Document                               | What it covers                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)               | The home page of the GitHub Pages site: the product on one page, the milestones and their issues with live states from GitHub |
| [backlog.md](backlog.md)               | Work we know we owe, not scheduled yet                                                                                        |
| [code-ownership.md](code-ownership.md) | Who touched which file, and in which pull requests, in French: the starting point of each folder in transcendence-course/     |

### api/

| Document                                                                                                                                                                                                                                                                                                                           | What it covers                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [api/README.md](api/README.md)                                                                                                                                                                                                                                                                                                     | The reading order and what each chapter teaches                       |
| [01](api/01-big-picture.md), [02](api/02-boot-and-request-flow.md), [03](api/03-infrastructure.md), [04](api/04-database.md), [05](api/05-auth-and-users.md), [06](api/06-llm.md), [07](api/07-courses-placement.md), [08](api/08-lessons.md), [09](api/09-social-and-realtime.md), [10](api/10-tests.md), [11](api/11-scripts.md) | The eleven chapters, from what an API is to the tests and the scripts |

### web/

| Document                                                                                                                                                                                                                                                                                | What it covers                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [web/README.md](web/README.md)                                                                                                                                                                                                                                                          | The reading order and what each chapter teaches                           |
| [01](web/01-react-and-nextjs.md), [02](web/02-routing-layouts-i18n.md), [03](web/03-shell-components.md), [04](web/04-talking-to-the-api.md), [05](web/05-account-pages.md), [06](web/06-learning-pages.md), [07](web/07-lesson-player.md), [08](web/08-chat.md), [09](web/09-tests.md) | The nine chapters, from React basics to each page, the chat and the tests |

### modules/

| Document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What it covers                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [modules/README.md](modules/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Every claimed module with its type and points, the total, and the modules we do not claim with the reason                                    |
| [modules/\_template.md](modules/_template.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The headings every module file follows                                                                                                       |
| [framework.md](modules/framework.md), [orm.md](modules/orm.md), [user-management.md](modules/user-management.md), [two-factor-auth.md](modules/two-factor-auth.md), [user-interaction.md](modules/user-interaction.md), [websockets.md](modules/websockets.md), [llm-interface.md](modules/llm-interface.md), [i18n.md](modules/i18n.md), [browsers.md](modules/browsers.md), [ssr.md](modules/ssr.md), [advanced-search.md](modules/advanced-search.md), [gamification.md](modules/gamification.md), [monitoring.md](modules/monitoring.md), [custom-ci-cd.md](modules/custom-ci-cd.md), [custom-cloud-deploy.md](modules/custom-cloud-deploy.md) | One file per claimed module: what the subject asks, what we built, where the code is, how to show it, the tests, the limits and who built it |

### architecture/

| Document                                                         | What it covers                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)             | The containers in production and development, Caddy's routes, a request through the stack, a live update, the lesson routes, the tooling image and what CI runs |
| [architecture/product.md](architecture/product.md)               | The learner journey (onboarding, placement, the daily goal, the lesson, the results), Redis, the AI layer and throttling                                        |
| [architecture/data-model.md](architecture/data-model.md)         | Every table and enum, what Redis holds, the tables each module needs, and what was dropped from the old plan                                                    |
| [architecture/realtime.md](architecture/realtime.md)             | Which features use REST, the WebSocket gateway or Server-Sent Events, and why; every socket event; the lesson discussion stream                                 |
| [architecture/technical-plan.md](architecture/technical-plan.md) | The stack and why, the repository layout, the Docker stages, the Makefile, the CI workflows, the build order and the risks                                      |

### operations/

| Document                                               | What it covers                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [operations/deployment.md](operations/deployment.md)   | The Oracle Cloud server, DNS, the `.env`, deploying and redeploying, automatic deploys, memory, monitoring on the server, and running behind another reverse proxy |
| [operations/monitoring.md](operations/monitoring.md)   | Prometheus, Grafana, the dashboards, the alerts and every metric                                                                                                   |
| [operations/versions.md](operations/versions.md)       | What has to move together, what is held back, and when to look again                                                                                               |
| [operations/development.md](operations/development.md) | The shell shortcuts of the devcontainer, and the monitoring stack in development                                                                                   |

### content/

| Document                                     | What it covers                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [content/lessons.md](content/lessons.md)     | The lessons: outlines, authoring, checks, seeding, the lesson pages, scoring and the discussion step     |
| [content/item-bank.md](content/item-bank.md) | The placement question bank: what to write, in what shape, so questions can be seeded and never repeated |

### subject/

| Document                                                     | What it covers                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [subject/summary.md](subject/summary.md)                     | A summary of the subject: the mandatory part, the modules, the README rules and the evaluation |
| [subject/ft_transcendence.pdf](subject/ft_transcendence.pdf) | The subject itself, which stays the authority                                                  |

### transcendence-course/

| Document                                                         | What it covers                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [transcendence-course/README.md](transcendence-course/README.md) | How the folder works, and one folder per member: [victor/](transcendence-course/victor/README.md), [endrit/](transcendence-course/endrit/README.md), [anais/](transcendence-course/anais/README.md), [luca/](transcendence-course/luca/README.md), [bastian/](transcendence-course/bastian/README.md) |

### site/

| Document                                                           | What it covers                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [site/milestone1-data-model.html](site/milestone1-data-model.html) | Onboarding and placement: every format, spec against code                          |
| [site/milestone2-data-model.html](site/milestone2-data-model.html) | Lessons: the lesson files, the seed, the attempt and discussion APIs, gamification |
| [site/milestone3-data-model.html](site/milestone3-data-model.html) | Real-time and social: socket events, friendships, messages, presence               |
| [site/gh-status.js](site/gh-status.js)                             | Not a document: the HTML pages load it to show live issue states from GitHub       |

Every count, route, variable and metric name in these documents is taken from the code on `main`.
When the code changes, the document that owns the topic changes in the same pull request.

The English `docs/` is the reference. [docs-fr/](../docs-fr/README.md) is its translation: when they
disagree, `docs/` wins. A pull request that changes a page of `docs/` updates its `docs-fr/` twin in the
same pull request, or opens an issue for it.
