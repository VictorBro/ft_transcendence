# Defence runbook

The order of the defence, on one page. The steps of each demo are in the "How to show it at the defence" section of its module file in [modules/](modules/README.md): this page links to them and does not repeat them. When a step is wrong or out of date, fix it in the module file, not here.

## The order

Keep the browser's developer tools open on the Console tab for the whole defence: the subject asks for no error and no warning.

| # | What | Account | Who shows it | Time |
| --- | --- | --- | --- | --- |
| 1 | [The mandatory checks](#the-mandatory-checks) | none | Victor | 5 min |
| 2 | [Framework](modules/framework.md#how-to-show-it-at-the-defence) | a new account | Victor | 5 min |
| 3 | [ORM](modules/orm.md#how-to-show-it-at-the-defence) | a new account, then `make studio` | Victor, Anaïs | 5 min |
| 4 | [Server-Side Rendering](modules/ssr.md#how-to-show-it-at-the-defence) | a new account | Bastian | 5 min |
| 5 | [LLM interface](modules/llm-interface.md#how-to-show-it-at-the-defence), steps 1 to 13 | a new account | Luca | 5 min |
| 6 | [Advanced search](modules/advanced-search.md#how-to-show-it-at-the-defence), in a private window | a new account | Luca, Endrit | 5 min |
| 7 | [LLM interface](modules/llm-interface.md#how-to-show-it-at-the-defence), step 14 to the end | the account of row 5 | Luca | 5 min |
| 8 | [Internationalization](modules/i18n.md#how-to-show-it-at-the-defence) | a new account | Luca | 5 min |
| 9 | [Gamification](modules/gamification.md#how-to-show-it-at-the-defence) | a new account, then a demo learner | Anaïs | 5 min |
| 10 | [2FA](modules/two-factor-auth.md#how-to-show-it-at-the-defence) | a new account | Victor | 5 min |
| 11 | [User management](modules/user-management.md#how-to-show-it-at-the-defence) | two accounts, two windows | Victor, Anaïs, Endrit | 5 min |
| 12 | [User interaction](modules/user-interaction.md#how-to-show-it-at-the-defence) | two accounts, two windows | Victor | 5 min |
| 13 | [WebSockets](modules/websockets.md#how-to-show-it-at-the-defence) | two accounts, two windows | Victor, Endrit | 5 min |
| 14 | [Two more browsers](modules/browsers.md#how-to-show-it-at-the-defence) | Firefox, and Safari if there is a Mac | Bastian | 5 min |
| 15 | [Monitoring](modules/monitoring.md#how-to-show-it-at-the-defence) | Grafana `admin` | Victor | 5 min |
| 16 | [CI/CD](modules/custom-ci-cd.md#how-to-show-it-at-the-defence) | GitHub, a demo pull request | Victor | 10 min |
| 17 | [Cloud deployment](modules/custom-cloud-deploy.md#how-to-show-it-at-the-defence) | the live site, then `ssh` | Victor | 5 min |

The times are guesses until the rehearsal measures them. Row 6 fills the one-minute wait of the LLM rate limit. Rows 11 to 13 each create their own two users: the rehearsal says whether one pair can serve all three. Who shows a module is the person who built most of it, from the "Who built it" section of its file; the evaluators may still ask anyone to explain or change any part.

## The mandatory checks

A missing one rejects the project ([subject/summary.md](subject/summary.md)).

- [ ] **One command.** `make` from a fresh clone builds and starts everything ([README](../README.md)).
- [ ] **HTTPS.** The app answers at `https://localhost` (or the port `make` prints), and the live site has a certificate the browser trusts ([custom-cloud-deploy.md](modules/custom-cloud-deploy.md#how-to-show-it-at-the-defence)).
- [ ] **A clean console.** No error and no warning in the Console tab during the whole demo.
- [ ] **`.env.example`.** It is committed, and `git check-ignore .env` shows that `.env` is ignored.
- [ ] **Pages without JavaScript.** Turn JavaScript off and pages still show their content ([ssr.md](modules/ssr.md#how-to-show-it-at-the-defence)).
- [ ] **Privacy Policy and Terms of Service.** The footer links open `/en/privacy` and `/en/terms`, with real content, in the three languages.

## Before the day

- [ ] Confirm with staff that gamification counts in a learning app ([modules/README.md](modules/README.md#gamification-outside-a-game)).
- [ ] On the defence machine: a fresh clone, `make` green, the local certificate trusted, `HTTPS_PORT` set if port 443 is not free.
- [ ] In `.env`: `DEMO_PASSWORD` set before `make`, for the demo learners; `LLM_PROVIDER=gemini` and a working `LLM_API_KEY`, with quota left for the day.
- [ ] The live site is up and its certificate is valid; whoever shows row 17 can `ssh` to the server.
- [ ] Whoever shows row 16 can push a branch and open a pull request; delete the demo branch afterwards.
- [ ] Each member has read their own folder in [transcendence-course/](transcendence-course/README.md).

## Rehearsals

A rehearsal runs this page from start to end, led by someone who did not build the module being shown.

| Date | Led by | Total time | What it found |
| --- | --- | --- | --- |
| | | | |
