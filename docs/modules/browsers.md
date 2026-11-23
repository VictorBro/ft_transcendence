# Support for at least 2 additional browsers (Minor, 1 point)

**Type:** Minor. **Points:** 1. **Status:** done.

The subject requires the app to work in Google Chrome. This module says it also works in two more
browsers. We test it on Firefox and on WebKit, the engine behind Safari: every automated browser
test runs on Chromium, Firefox and WebKit, on every pull request.

## What the subject asks

The module is a Minor row in the Accessibility and Internationalization table of
[../subject/summary.md](../subject/summary.md):

> ≥2 additional browsers fully supported, tested, documented

The PDF ([../subject/ft_transcendence.pdf](../subject/ft_transcendence.pdf), chapter IV,
Accessibility and Internationalization) words it like this:

> Minor: Support for additional browsers.
>
> - Full compatibility with at least 2 additional browsers (Firefox, Safari, Edge, etc.).
> - Test and fix all features in each browser.
> - Document any browser-specific limitations.
> - Consistent UI/UX across all supported browsers.

"Additional" means on top of the browser the mandatory part already asks for. The same file
lists, under "Mandatory part":

> - Compatible with the latest stable **Google Chrome**.
> - **No JS errors or warnings** in the browser console.

So the two additional browsers must also show no console errors or warnings.

## How we meet it

| The subject asks | What we built | Where |
| --- | --- | --- |
| At least 2 additional browsers | Firefox and WebKit (Safari's engine), next to Chromium. Playwright (the tool that drives a real browser in our tests) has one "project" per engine: `chromium` (Desktop Chrome), `firefox` (Desktop Firefox) and `webkit` (Desktop Safari). | [e2e/playwright.config.ts](../../e2e/playwright.config.ts) |
| Fully supported | The app has fixes for things only one engine does (see "How it works"). The console gate (a test that fails on any console error or warning) runs on all three engines. Desktop browsers only, see [Limits and choices](#limits-and-choices). | [e2e/support/console-guard.ts](../../e2e/support/console-guard.ts), [e2e/tests/console.spec.ts](../../e2e/tests/console.spec.ts) |
| Tested | Every spec file runs on all three engines in CI: 3 engines × 2 parts = 6 jobs, each on its own production stack. A final job, "playwright (production stack)", fails if any of the six did not pass. A few tests run on Chromium only, each with a `test.skip` that gives the reason (see [Limits and choices](#limits-and-choices)). | [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml) |
| Documented, with the limits of each browser | The README has a "Browser support" section: which engines, how CI runs them, how to run one engine, and the known limits (no speech voice, mobile browsers not tested). | [README.md](../../README.md#browser-support) |
| Consistent UI/UX across browsers | The three engines get the same pages, the same styles and the same tests, with the same checks of what is on screen. The phone-width layout check also runs on each engine. | [e2e/tests/layout-gate.spec.ts](../../e2e/tests/layout-gate.spec.ts) |

## How it works

**One suite, three engines.** [e2e/playwright.config.ts](../../e2e/playwright.config.ts) lists
three projects. Its comment states the rule: "every spec runs on all three engines. A spec that
cannot hold on one of them says so with a test.skip naming the engine and the reason, never by
dropping the project."

**In CI.** [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml) runs on every pull request
and on every push to `main`. Its matrix is `browser: [chromium, firefox, webkit]` × `part:
[lesson, rest]`. `lesson.spec.ts` takes about half of the suite's time, so it is one part, and every
other spec is the other part (`E2E_PART` in the config). Each job:

1. starts the production stack (`compose.yml` + `compose.prod.yml`);
2. applies the migrations and loads the question bank (`make db-ready`);
3. runs `./scripts/playwright-in-image.sh test --project=<browser>`.

[scripts/playwright-in-image.sh](../../scripts/playwright-in-image.sh) runs Playwright inside
Microsoft's Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`, the version from
[e2e/package.json](../../e2e/package.json)). That image already holds the three browsers and their
system packages. `fail-fast: false` keeps the other jobs running when one fails, so "a WebKit
failure should not hide whether Chromium and Firefox pass".

**On a developer machine.** In the [Makefile](../../Makefile), `BROWSERS ?= chromium`: `make` and
`make playwright` run Chromium only, to stay quick. `make playwright-all` runs the three engines, "as
CI runs it". The devcontainer image has the system libraries of the three browsers
([.devcontainer/Dockerfile](../../.devcontainer/Dockerfile)).

**The console gate on three engines.** Each engine reports things in its own words.
[e2e/support/console-guard.ts](../../e2e/support/console-guard.ts) handles this:

- A navigation cancels the prefetches still open. Every engine reports this as a failed request:
  Chromium `net::ERR_ABORTED`, Firefox `NS_BINDING_ABORTED`, WebKit `cancelled` or
  `Load request cancelled`. The gate ignores these four words only.
- Three Firefox warnings are allowed, and only on `/grafana/` pages: they come from Grafana's own
  code, not ours. The same warning on one of our pages still fails the test.
- `settle()` waits for the page to go quiet. Firefox sometimes never reports `networkidle`, so it
  also counts the open requests itself and takes whichever comes first.

**Fixes in the app for one engine.** Each one has a comment in the code:

| Engine | What goes wrong | The fix | Where |
| --- | --- | --- | --- |
| Firefox | Firefox never starts a drag from a `<button>`. | The options of the drag board are a `div` with the button role, which the keyboard still works with Enter and Space. | [apps/web/components/lesson/board.tsx](../../apps/web/components/lesson/board.tsx) |
| Firefox | Firefox logs an interrupted connection when a page closes with a socket open. | `closeOnBeforeunload: true` closes the socket first. | [apps/web/components/tab-socket.ts](../../apps/web/components/tab-socket.ts) |
| Safari | Safari ends a typing composition (for example accents typed with a dead key) before the keydown, so Enter could send a half-typed message. | Enter does nothing when `keyCode` is 229. | [apps/web/app/[locale]/(messages)/chat/chat-thread.tsx](<../../apps/web/app/[locale]/(messages)/chat/chat-thread.tsx>) |
| WebKit | WebKit does not focus a scrolling box by itself, so a keyboard could not reach the end of a long text. | The reading document is a focusable region. | [apps/web/components/lesson/kinds/reading.tsx](../../apps/web/components/lesson/kinds/reading.tsx) |

**Read aloud without a voice.** The Listen buttons use the browser's speech synthesis
([apps/web/components/lesson/speech.tsx](../../apps/web/components/lesson/speech.tsx)). Voices
differ between browsers and systems, and headless browsers often have none. When there is no voice
for the course language, the Listen buttons are not shown, and the lesson still works. In a
functions lesson, the listening reply always has a **Show the text** button, so it can be answered
without sound ([apps/web/components/lesson/kinds/functions.tsx](../../apps/web/components/lesson/kinds/functions.tsx)).

## Where the code is

| Path | What it does |
| --- | --- |
| [e2e/playwright.config.ts](../../e2e/playwright.config.ts) | The three projects `chromium`, `firefox`, `webkit`; the `lesson`/`rest` split; 2 workers, no retries. |
| [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml) | The 6 jobs (3 engines × 2 parts) and the gate job "playwright (production stack)". |
| [scripts/playwright-in-image.sh](../../scripts/playwright-in-image.sh) | Runs Playwright in its official image, which has the three browsers. |
| [Makefile](../../Makefile) | `BROWSERS`, `make playwright`, `make playwright-all`, `make report`. |
| [e2e/package.json](../../e2e/package.json) | `test:e2e`, `test:e2e:restart` and `browsers` (installs Chromium, Firefox and WebKit). |
| [e2e/support/console-guard.ts](../../e2e/support/console-guard.ts) | The console gate: each engine's words for a cancelled request, the Grafana-only Firefox allowances, `settle()`. |
| [e2e/support/signup-budget.ts](../../e2e/support/signup-budget.ts) | Three engines sign up three times more accounts. This paces the sign-ups and logins under the API's rate limits. |
| [apps/web/components/lesson/speech.tsx](../../apps/web/components/lesson/speech.tsx) | Listen buttons only when the browser has a voice for the language. |
| [apps/web/components/lesson/board.tsx](../../apps/web/components/lesson/board.tsx), [apps/web/components/tab-socket.ts](../../apps/web/components/tab-socket.ts), [chat-thread.tsx](<../../apps/web/app/[locale]/(messages)/chat/chat-thread.tsx>), [reading.tsx](../../apps/web/components/lesson/kinds/reading.tsx) | The fixes for one engine, in the table above. |
| [README.md](../../README.md#browser-support) | The "Browser support" section. |

## How to show it at the defence

1. **The documentation.** Open [README.md](../../README.md#browser-support), section "Browser
   support". Then open [e2e/playwright.config.ts](../../e2e/playwright.config.ts) and show the
   three `projects`.
2. **The CI.** On GitHub, open the Actions tab, workflow **e2e**, and the last run on `main`. Show
   the six jobs `playwright (chromium, lesson)`, `playwright (chromium, rest)`,
   `playwright (firefox, lesson)`, `playwright (firefox, rest)`, `playwright (webkit, lesson)`,
   `playwright (webkit, rest)`, and the gate `playwright (production stack)`, all green.
3. **The tests, run live.** Inside the devcontainer, with the stack up (after `make` or
   `make run`):

   ```bash
   make playwright BROWSERS="firefox webkit"   # the two additional engines
   make playwright-all                         # or all three, as CI does
   make report                                 # serves the report on http://127.0.0.1:9323
   ```

   In the report, filter by project (`firefox`, `webkit`) and show the passed tests. Point out the
   few skipped ones and their reason. A full run takes a while: start it before the other modules.

4. **By hand.** On the evaluator's machine, open the address `make` printed (for example
   <https://localhost>) in Firefox, then in Safari if there is a Mac. Open the browser's developer
   console. Go to `/en/login`, click **Create one**, sign up and go through the onboarding. Open a
   lesson. The console stays empty. In Firefox, a drag board can be played by dragging the options.

## Tests that prove it

Every spec in [e2e/tests/](../../e2e/tests/) runs on the three engines unless it says otherwise.
These ones matter most for this module:

| Test | What it checks |
| --- | --- |
| [e2e/tests/console.spec.ts](../../e2e/tests/console.spec.ts) | Every route in `e2e/support/routes.ts`, signed out and signed in, and client-side navigation: no console error, no warning, no uncaught exception, no failed request. On all three engines. |
| [e2e/tests/lesson.spec.ts](../../e2e/tests/lesson.spec.ts) | "plays from the lesson page to the results, which stay" and the other grammar lesson tests; "plays to the results in a browser with no voice" (vocabulary); "plays to the results in a browser with no voice, through Show the text" (functions). On all three engines. |
| [e2e/tests/layout-gate.spec.ts](../../e2e/tests/layout-gate.spec.ts) | The phone-width layout check on each engine. It sets `isMobile` except on Firefox, and checks WebKit's late viewport update. |
| [e2e/tests/auth.spec.ts](../../e2e/tests/auth.spec.ts), [e2e/tests/course.spec.ts](../../e2e/tests/course.spec.ts), [e2e/tests/time-zone.spec.ts](../../e2e/tests/time-zone.spec.ts) | They wait for a redirect or a refresh to finish before the next page. Without that wait, Firefox and WebKit report the navigation as aborted or cancelled, which the console gate would catch. |
| [e2e/tests/signup-budget.spec.ts](../../e2e/tests/signup-budget.spec.ts) | The waiting logic that keeps sign-ups under the rate limit: it waits out a 429 (too many requests) and stops after three. |

## Limits and choices

- **Desktop only.** The three projects are Playwright's desktop devices. Mobile browsers are not
  tested (README, and "Not in this issue" in #159).
- **WebKit, not Safari.** Playwright's WebKit is the engine behind Safari, not the Safari app. Its
  Firefox and Chromium are Playwright builds too, not the branded browsers.
- **Some tests run on Chromium only.** Each one says why in its `test.skip`:

  | Test | Reason given in the code |
  | --- | --- |
  | `restart.spec.ts`: "an open page reconnects after an API restart, silently" | Two API starts in 15 minutes fire the `ApiRestarting` alert, so one engine restarts it: "one restart a run, on Chromium". The comment says Firefox and WebKit are checked by hand. |
  | `lesson.spec.ts`: "says when the time ran out while the learner was away" | The wait is the server's: "Chromium covers the wait". |
  | `lesson.spec.ts`: "every French A1 grammar / vocabulary / functions lesson" | The renderers are already tested on every engine by the single-lesson tests: "Chromium covers the content". |
  | `lesson.spec.ts`: "shows the Listen buttons once a French voice is there" | The voice is a fake one put into the page: "The voice is a stub". |
  | `level-complete.spec.ts`: "the level complete card starts the next level" | It plays through the API, not the browser: "API play: the engine adds nothing, the rate limit minutes". |

- **No screenshot comparison.** The tests check what is on screen on each engine, but no test
  compares screenshots between engines.
- **Read aloud depends on the browser.** Without a voice for the language, there are no Listen
  buttons. The functions listening reply is answered through **Show the text**. Real voices on
  Firefox and WebKit are not tested: headless browsers have none, and the voice test is Chromium
  only.
- **Speed.** `make` runs Chromium alone, because three engines on one stack were "most of a
  `make all`" ([Makefile](../../Makefile)). CI runs all three on every pull request.

## Who built it

| Member | GitHub | What they built | Issues and PRs |
| --- | --- | --- | --- |
| Bastian | bastian-schnitzler | The `firefox` and `webkit` projects, the three engines in CI, make and the devcontainer, each engine's words in the console gate, `settle()`, the pacing of sign-ups and logins, the README "Browser support" section. Later, the Firefox drag fix in the lesson player and Firefox waits in the e2e tests. | [#159](https://github.com/VictorBro/ft_transcendence/issues/159), [#169](https://github.com/VictorBro/ft_transcendence/pull/169), [#177](https://github.com/VictorBro/ft_transcendence/pull/177), [#186](https://github.com/VictorBro/ft_transcendence/pull/186), [#192](https://github.com/VictorBro/ft_transcendence/pull/192) |
| Victor | VictorBro | Opened #159. Split each engine's CI run in two parts (#198) and moved Playwright into its own image (#200); `BROWSERS` and `make playwright-all`. The Firefox socket close and the Safari Enter fix in the chat. | [#198](https://github.com/VictorBro/ft_transcendence/pull/198), [#181](https://github.com/VictorBro/ft_transcendence/pull/181), [#200](https://github.com/VictorBro/ft_transcendence/pull/200) |
| Endrit | VYAntares | The focusable reading document, so a keyboard can scroll a long text in Safari. | [#203](https://github.com/VictorBro/ft_transcendence/pull/203) |
| Luca | luca-mattei | The all lessons page and its e2e tests, including one that caught a search box reset that showed up mostly on WebKit; the discussion test that allows the 429 line Chromium and WebKit log. | [#196](https://github.com/VictorBro/ft_transcendence/pull/196), [#205](https://github.com/VictorBro/ft_transcendence/pull/205) |
