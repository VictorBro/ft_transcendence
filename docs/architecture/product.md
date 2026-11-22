# Product Architecture

The product, the modules, the AI layer and the schema, as built at the end of Milestone 2.
[architecture/technical-plan.md](technical-plan.md) covers the infrastructure around it (repository layout,
containers, CI and build order), [architecture/overview.md](overview.md) the containers and the request
paths, and [content/lessons.md](../content/lessons.md) the lesson content, its seeding and the lesson player.

The subject lists this project by name in chapter V.6:

> **Language Learning Platform**: Lessons, exercises, progress tracking, and peer practice.
> Point potential: 15+ points.

---

## 1. The learner journey

The product is one loop, repeated. Everything in this document exists to serve it.

```
sign up / log in  →  onboarding  →  placement   →    daily goal    →    lesson    →  results  →  daily goal …
                     (2 questions)  (binary search)  (today's lessons)  (practice → discussion
                                                                          → exam)
```

| Step | What the learner sees | What the system does |
|---|---|---|
| **Onboarding** | Two questions: which language to learn, and a daily goal (10, 30 or 60 minutes). Repeated per language, so adding a second course starts here again | Creates a `UserLevel` row for that `(user, language)`. `level` stays null until placement sets it. No AI call. |
| **Placement** | One question at a time, each with its own countdown, then a red and green report. Skippable by a learner who already knows their level, and overridable if they disagree with the result | Binary search over the six CEFR levels, in **our code**. Questions are multiple choice, so scoring is a string comparison, and the LLM restocks a cell in the background once a learner is down to 3 unseen questions in it. Writes `UserLevel.level`. See §1.2 |
| **Daily goal** | Today's lessons from the level's syllabus: the ones that meet the goal, three extra, the streak, the level's progress, XP and rank, and the daily challenge. Nothing is locked: any ready lesson of the course language can be played, and the all lessons page lists the whole level, "Coming soon" rows included | Reads the seeded `Lesson` catalogue for (language, level) and the course's `LessonResult` rows, and proposes the lowest **ready** lessons not yet passed (§1.3). Writes nothing. No AI call. How the syllabus is sized, written and seeded is in [content/lessons.md](../content/lessons.md) |
| **Lesson** | The lesson's start page, then the player: presentation and practice pages one at a time, each practice page corrected as soon as it is checked, a discussion with the lesson's tutor, then a timed exam (§1.4) | Plays a lesson written ahead and committed to the repo. The server runs the attempt in `LessonAttempt`: it sends only the page at the cursor, checks every answer and owns the exam timer. One LLM call per discussion message, streamed. Nothing else in a lesson calls the LLM |
| **Results** | The score, every answer with its correction, the lesson counted toward today's goal pass or fail, and the XP, challenge and achievements it earned | Score computed **in code** from the answers the server stored, written once when the last page locks. The course's `LessonResult` keeps the best score, the streak moves when the goal becomes met, and the gamification columns and `UserAchievement` are written in the same transaction. No AI call |

### The rule that makes this work

> **The LLM writes individual items and explains. Our code owns state, scoring and
> progression.**

In Milestone 2 the LLM does exactly two things at runtime: it restocks the placement bank when a
cell runs low (§1.2), and it answers the learner on a lesson's discussion page (§1.4). It never
writes a lesson, never scores an answer and never decides a level.

This is the spine of the whole design, and it is worth defending in one place because every
other decision follows from it:

- **It is explainable.** The subject requires you to explain your AI implementation at
  evaluation. "A binary search over the six CEFR levels, six questions per level, a second
  mistake ends the level" is explainable in one breath. "We asked the model to decide the level"
  is not.
- **It is testable.** With `LLM_PROVIDER=fixture` the entire progression is deterministic and
  unit-testable. Ask the LLM to own progression and nothing is testable without spending money.
  The proposal, the streak and level completion are pure functions with no clock and no database.
- **It is cheap.** Proposing today's lessons, scoring an attempt, keeping the best score, moving
  the streak, deciding that a level is complete, none of that needs a token.
- **It cannot embarrass you in a demo.** A model that decides to award B2 for a blank answer is
  a live failure. A binary search in TypeScript cannot.

### 1.2 Placement is a binary search, and never the same question twice

A placement run answers exactly one question: which of the six CEFR levels is this learner at.
It is a search in our code, not a judgment by the model.

**The search.** Keep the range of levels still possible, `lo = A1` and `hi = C2`, and probe the
middle of it. The first probe is therefore always B1.

- **Level passed:** everything above is still in play, so `lo = level + 1`.
- **Level failed:** everything below it is, so `hi = level - 1`.
- **`lo > hi`:** the search is over. The result is `lo`, the level to learn: one above the highest
  level passed, capped at C2, or A1 if none was passed.
- **C1 passed:** the search is over too, at C2. C2 is not probed: passed or failed, the result
  would be C2.

Three probes settle six levels, so a run is at most three levels deep.

**A worked run.** B1 is always the first probe. Six questions there, one of them wrong: that is
still a pass, so `lo` becomes B2 and the next probe is the middle of B2 to C2, which is **C1**.
Two wrong at C1: the level stops there, `hi` becomes B2, and the last probe is B2 itself. The
result is C1 if it passes and B2 if it does not, one above the highest level passed.

**What passing a level means.** Six questions at that level, two from each category:
`vocabulary`, `grammar` and `reading`. **One mistake is allowed; the second ends the level.**
A learner who is out of their depth stops after two questions instead of sitting through six,
and a single slip does not cost them a level.

Every question carries its own countdown (`QuestionBank.timeLimitS`), and running out of time
counts as a wrong answer. Without that, a stalled tab is an unbounded test.

**Drawing a question is a cascade, never a wall.** Every step draws from one cell, the
`(lang, level, category)` being probed, so a French B1 grammar probe can only ever serve a French
B1 grammar question:

1. **The bank**, excluding everything this learner has already been served (`UserSeenQuestion`).
   Written rows, the ones with a `sourceId`, go first: a generated row is drawn only once the
   learner has no unseen written row left in the cell.
2. **Down to 3 unseen in the cell, so restock it in the background.** One structured LLM call
   returns a batch for the cell (13 grammar, 10 vocabulary or 5 reading). It is schema-validated,
   deduplicated against the cell and written to `QuestionBank` with no `sourceId`. The draw never
   waits for it: the new rows reach this learner and the next ones through step 1. **The bank
   grows as it is used**, and a null `sourceId` is what marks the rows no human reviewed.
3. **Nothing unseen left** (generation failed, has not landed yet, or there is no key): serve the
   question this learner saw longest ago at that level, never one already asked in this run.
   This is the one path that repeats a question. A repeat after months is a weak measurement,
   and an abandoned exam is no measurement at all.

Bank first rather than generate every time buys three things. **Quality:** a seeded question was
reviewed by a human once, a live one cannot be. **Cost:** near zero on the common path.
**Provability:** the exclusion is a `NOT EXISTS` over `UserSeenQuestion`, not a hope about
sampling temperature.

**The clock belongs to the server.** Each question carries its own `timeLimitS`, and the server
stamps the moment it served the question. It stamps that once: a refresh re-reads the question
with the time that is actually left, never a fresh limit. When the answer arrives the server
recomputes the elapsed time and decides lateness itself, whatever the request claims, with a
couple of seconds of grace for the network. The countdown in the browser is there so the learner
can see it, and is never the thing that judges.

**Skipping, overriding and retaking.** A learner who already knows their level skips the exam and
sets their level directly. A learner who disagrees with the result can change it on the spot. A
retake is the same search run again, drawing against the same `UserSeenQuestion` rows, so it asks
new questions unless step 3 fires. All three write through the same endpoint, and only the
current level is stored, never a history of runs. A run where every answer timed out writes
nothing: a learner who walked away measured nothing, so the course keeps the level it had, or
stays without one, and the result says so with `applied: false`.

**The report is red and green.** At the end the learner sees every question they were asked,
their answer in red and the correct one in green. No explanations: nothing in the bank holds one.
It is built from the run state and dies with it.

**The run itself is not a table.** The bounds, the level being probed, the tally per category, the
mistakes so far and the report live in Redis under the learner, `user:<id>:eval`, with a
one-hour TTL (§4). A learner who signs in again within the hour comes back to the exam they left;
after that the run is gone. Two things outlive it: the `UserSeenQuestion` rows, and the final level.

**The whole run, drawn.** A thick border is an LLM call. There is one, off the draw's path: a
cell is restocked in the background once a learner is down to 3 unseen questions in it.

```mermaid
flowchart TD
    start(["Placement starts"]) --> bounds["lo = A1, hi = C2"]
    bounds --> probe["Probe the middle level<br/><small>first probe is always B1</small>"]
    probe --> draw["Ask for one unseen question<br/><small>two each: vocabulary, grammar, reading</small>"]

    subgraph cascade["Drawing a question: a cascade, never a wall"]
        bank["1. The bank, excluding this<br/>learner's seen rows"]
        gen["2. Restock the cell in the background<br/><small>at 3 unseen or fewer, never waited for</small>"]
        lru["3. This learner's oldest<br/>seen question"]
        bank -. "running low" .-> gen
        gen -. "new rows" .-> bank
        bank -- "nothing unseen left" --> lru
    end

    draw --> bank
    cascade -- "first step that yields one" --> serve["Serve it, start the countdown,<br/>record it as seen"]
    serve --> judge{"Correct, in time?"}
    judge -- "yes" --> six{"Six asked at<br/>this level?"}
    judge -- "no" --> second{"Second mistake<br/>at this level?"}
    second -- "no" --> six
    second -- "yes" --> failed["Level failed<br/><small>hi = level - 1</small>"]
    six -- "not yet" --> draw
    six -- "yes" --> passed["Level passed<br/><small>lo = level + 1</small>"]
    passed --> over{"lo > hi,<br/>or C1 passed?"}
    failed --> over
    over -- "no" --> probe
    over -- "yes" --> result["One above the highest level passed<br/><small>capped at C2, written to UserLevel.level</small>"]

    classDef llm stroke-width:3px
    class gen llm
```

### 1.3 The daily goal shapes the session, never the syllabus

**Ten, thirty or sixty minutes.** Picked at onboarding, changeable afterwards on the daily goal
page. A lesson is written to take about ten minutes, so **the goal counts lessons**: 10 means one
lesson finished that day, 30 means three, 60 means six. That is why those three values and not
others; ten divides all of them evenly. A finish counts pass or fail, from any list, and a lesson
finished twice in a day counts once. Nothing tracks minutes, and `DailyStat` is not built.

> **Open, for the team: how long a lesson takes.** The goal counts lessons at
> `LESSON_MINUTES = 10`, but the 216 ready lessons are planned at 8 to 37 minutes
> (`estimatedMinutes`, median 17.5), so the six lessons of the 60-minute goal can take well over an
> hour. Either the
> goal keeps counting 1, 3 or 6 lessons and the minutes are a rough label, or the authoring kit
> ([#83](https://github.com/VictorBro/ft_transcendence/issues/83)) keeps lessons nearer ten
> minutes. The code does the first today.

The goal does two things:

- **Sizes today's plan.** The daily goal page proposes as many lessons as the goal still needs,
  then three extra. They come from a queue over the current level's ready lessons: the ones not finished
  today, first the ones not yet passed in syllabus order (failed ones included), then passed
  ones as review, least recently finished first. Once the goal is met, only the three extra
  remain. The next day, the proposal starts again at the lowest lesson not yet passed.
- **Defines the streak.** Three columns on `UserLevel`, so one streak per course: `streak`,
  `bestStreak` and `lastGoalDay`. The streak moves when the day's goal becomes met, by a finish
  or by lowering the goal: if `lastGoalDay` is already today nothing changes, if it is yesterday
  the streak grows by one, otherwise it restarts at 1. It shows while `lastGoalDay` is today or
  yesterday, and 0 after that. Raising the goal never cancels a day already met, so a learner
  can lower the goal, meet it, raise it again and still keep the day. We accept that.
  `lastGoalDay` is the only stored day: there is no day history, so no calendar and no "days
  met this week".

Gamification also reads the goal: meeting it earns XP, and one daily challenge asks for a lesson
beyond it ([#94](https://github.com/VictorBro/ft_transcendence/issues/94),
[#95](https://github.com/VictorBro/ft_transcendence/issues/95)).

**Gamification, per course.** XP (10 for a lesson's first finish of the day plus every point it
adds to that lesson's best score, 20 for meeting the goal, 30 for the challenge) and ranks (rank
n to n + 1 needs n × 100 more XP); one daily challenge out of six, picked by a hash of the course
and the day, so nothing stores it; and 16 achievements, earned once and never lost. The rules are
pure functions (`gamification.rules.ts`), the awards run inside the finish transaction
(`gamification.ts`), and the course page, the results and `/learn/{lang}/achievements` show them
(#97). Leaderboards, badges and rewards are not built.

**The day is the learner's.** `User.timeZone` (an IANA zone sent by the browser, UTC by default)
decides when a day ends, so a learner in Tokyo and one in New York each get their own midnight. A
finish that arrives after local midnight counts for the new day. A course's day never goes
backwards: it is never before its `lastGoalDay` or its newest result's day, so a flight west
cannot undo a day that was already met.

**A level is complete when every ready lesson was attempted and at least 80% are passed.** A
lesson is passed when its best score is 70 or more. With 12 ready lessons per level today, that is
all 12 attempted and 10 passed; the bar moves as more lessons become ready. Only a complete level offers "Start B1": attempting
every lesson means the whole syllabus was seen, and 80% means it was learned, without asking for a
perfect score on each one. The learner can still change level, or retake placement, at any time.
**Switching level keeps all progress**: nothing is reset, and switching back continues where the
learner stopped.

**The syllabus is keyed by `(language, level)` and never by the goal.** Changing the goal
regenerates nothing and moves no progress: the same list of lessons is simply walked faster or
slower. A syllabus per goal would mean three copies of every level to generate and review, and a
learner dropping from 60 to 10 would need their finished lessons mapped onto a different list.
Every language has the same number of outline entries per level, from 120 at A1 to 320 at C2:
3,990 `Lesson` rows in all, of which **216 are ready, the first 12 of each language and level**.
How many there are and how they are split by kind is in [content/lessons.md](../content/lessons.md) §0 to §3, how the
seed sets `ready` in §4, and how they are written in §7.

What it must never do is gate content. A learner past their goal keeps going if they want; it
is a target, not a cap, and a cap would punish exactly the behaviour the product exists for.
**No lesson is locked either.** The order only decides which lessons are proposed: the learner can
open any ready lesson of the course language, of any level, and every finish counts.

### 1.4 Anatomy of a lesson

A lesson is **written ahead, not generated**: its exercises, answer keys, exam and scoring are in
one or two committed JSON files, checked by the validators of the lesson prototype and copied into
`Lesson.brief` and `Lesson.content` by the seed ([content/lessons.md](../content/lessons.md) §4). The Milestone 2
replan ([#137](https://github.com/VictorBro/ft_transcendence/issues/137)) replaced the earlier
plan, where a tutor turned a short brief into exercises at runtime with RAG grounding and caches.
None of that was built.

**The four lesson pages.** Each kind has its own player (#146 to #149), on three routes under
`/{locale}/learn/{lang}/lessons/{id}`: the start page, `/play` and `/results`.

| Kind | What the learner does | Web player |
|---|---|---|
| Grammar | Explanations, then exercises (matching, gaps to choose or type, word order, spot the error), then a timed exam | on `main` (#146) |
| Vocabulary | Each group's introduction and flashcards, matching, a gender overview, practice, then a translation exam. No listening (below) | on `main` (#147) |
| Functions | A situation with two roles, expressions, listening replies with **Show the text**, a dialogue, then an exam in parts | on `main` (#149) |
| Reading | Two documents of one genre: one to learn with, a new one in the exam | on `main` (#148) |

A learner with a 10-minute goal who opens a grammar lesson from today's proposal:

| Moment | What the learner sees | What the system does |
|---|---|---|
| Start page | The title, the objective, the minutes and the numbered learning points | `GET …/attempt` reads the lesson row and the attempt, if any. Nothing is written |
| Start | The first page | `POST …/attempt { locale }` creates the `LessonAttempt`: the mother tongue fixed from the interface locale, a new 32-byte secret, the cursor at 0 |
| Each practice page | Its correction, as soon as it is checked | `POST …/attempt/pages/:index` locks that page's answers, scores them and moves the cursor. The keys of that page only are sent back |
| Discussion page | A chat with the lesson's tutor, optional | `POST …/discussion` streams the tutor's answer as Server-Sent Events. Unscored, and nothing of it is stored (§5) |
| Exam pages | A countdown per page, no correction | The deadline is set when the page is sent; a late page locks blank |
| Results | The score, every answer and its correction, XP, the challenge and achievements | The last page locks: the results are written once, and the finish (best score, goal, streak, XP, achievements) runs in the same transaction |

Two rules shape every page ([content/lessons.md](../content/lessons.md) §11):

- **The mother tongue.** The help around the lesson is in the interface language, unless that is
  the course language, then in the first other of en, fr, de. It is fixed on the attempt at its
  start.
- **Vocabulary without listening.** The vocabulary player drops the prototype's listening choice
  and dictation, so its exam is the translation only. Functions keep their listening replies, read
  by the browser's speech synthesis, with **Show the text** for a browser that has no voice.

**The discussion step replaces the tutor walkthrough.** It is the only place a learner talks to
the LLM in a lesson: one page, right before the exam info page, where the tutor knows the lesson's
teaching fields and the learner's wrong practice answers, but never the exam or its answers. How it
is built is in [content/lessons.md](../content/lessons.md) §12 and [architecture/overview.md](overview.md) §5.

### 1.5 Not built: cross-language chat

An early idea paired two learners, each writing their own language, with one LLM call per message
correcting the sender and translating for the other. It is not built. Direct messages between
friends (#158) are plain text with no AI in the middle, and no table stores a correction or a
mistake.

---

## 2. Modules and points

14 required, bonus capped at +5, so **19 is the maximum that can count**. Anything beyond that
is insurance against a module failing on the day. A module shown at evaluation that does not fully
work is worth 0.

The README's Modules section (#160) is to carry the justification, the implementation and the
owners of each module; today it covers Monitoring only. This table is the plan it follows, with
each module's state on `main`.

| Chapter | Module | Type | Pts | State on `main` |
|---|---|---|---|---|
| IV.1 Web | Framework for frontend and backend | Major | 2 | Next.js 16 and NestJS 11 |
| IV.1 Web | Real-time features with WebSockets | Major | 2 | Gateway on `/ws`: live course updates (#154), friend events (#155), online status (#157), direct messages (#158) |
| IV.1 Web | User interaction: chat, profiles, friends | Major | 2 | Friends (#155), public profiles (#156), direct messages between friends (#158) |
| IV.1 Web | ORM | Minor | 1 | Prisma 7 |
| IV.1 Web | Server-side rendering | Minor | 1 | App Router server components; it has to be shown, see §9 |
| IV.1 Web | Advanced search | Minor | 1 | The all lessons page: filters (status, kind, topic, theme, text), sort, group and numbered pages of 20 in the URL (#81, #87). Milestone 2 |
| IV.2 Accessibility | Support for at least 3 languages | Minor | 1 | `next-intl`, English, French and German |
| IV.2 Accessibility | Support for additional browsers | Minor | 1 | Every Playwright suite on Chromium, Firefox and WebKit in CI (#159) |
| IV.3 User management | Standard user management | Major | 2 | Profile, avatar, friends, public profiles, online status |
| IV.3 User management | Complete 2FA | Minor | 1 | TOTP and recovery codes |
| IV.4 Artificial intelligence | Complete LLM system interface | Major | 2 | Gemini behind `LlmProvider`: the placement bank restock (structured output) and the lesson discussion (streaming), with error handling and rate limits (#150, #151). Milestone 2 |
| IV.6 Gaming and UX | Gamification | Minor | 1 | XP and ranks, a daily challenge and 16 achievements, stored per course (#94, #95, #97). Milestone 2 |
| IV.7 DevOps | Monitoring with Prometheus and Grafana | Major | 2 | [operations/monitoring.md](../operations/monitoring.md) (#129) |
| IV.10 Module of choice | **Custom major: CI/CD** | Major | 2 | Five workflows, required checks on `main`, multi-arch images on GHCR, pull-based deploys ([architecture/technical-plan.md](technical-plan.md) §5, [operations/deployment.md](../operations/deployment.md)) |
| IV.10 Module of choice | **Custom minor: cloud deployment with DNS and Let's Encrypt** | Minor | 1 | A cloud VM, an A record, and Caddy's automatic Let's Encrypt certificate ([operations/deployment.md](../operations/deployment.md)) |
| | | | **22** | 7 majors and 8 minors, 3 above the 19 that count |

The team tracks each module's status on the wiki:
[status and points](https://github.com/VictorBro/ft_transcendence/wiki/status-points-on--21-October-2026).

**Gamification outside a game.** The module sits in the gaming chapter but, unlike its four
neighbours, carries no "requires a game" note. It is claimed on that reading; confirm it with
staff before the defence.

**Dropped**, and so not claimed:

| Module | Why |
|---|---|
| Complete RAG system | Lessons are authored and committed, so nothing at runtime retrieves reference passages. pgvector stays installed in the database image, unused |
| Notification system | Not built. The socket layer pushes live updates, but no notification is stored or listed |
| User activity analytics dashboard | Not built: `/dashboard` redirects to `/learn` |
| Public API, custom design system, advanced analytics | Not built |

**Explicitly out**: OAuth, RTL, every gaming module except Gamification, WAF/Vault, ELK,
microservices, blockchain, file upload, PWA, WCAG AA, voice, image recognition.

---

## 3. Transport: REST, Server-Sent Events and a WebSocket

This is the question that decides the shape of the codebase, so it gets a straight answer.

**Most of this product is request/response.** Onboarding, today's lessons, starting a lesson,
submitting a page, reading progress, all of that is HTTP. A tutor that answers one learner is not
"real-time" in the sense the subject means; the module asks for *"real-time updates across
clients"* and *"handle connection/disconnection gracefully"*, which is a multi-client claim.

So the socket layer has to earn its keep on genuinely multi-client surfaces. It does, on three:

| Surface | Why it must be a socket | Serves module |
|---|---|---|
| **Direct messages** between friends | Two clients, one conversation, sub-second echo, unread counts | Real-time (Major), User interaction (Major) |
| **Presence**, friends' online status | Server pushes state changes nobody polled for | User management (Major) |
| **Live course and friend updates** | A change in one tab shows in the account's other tabs, and on the friend's | Real-time (Major) |

**The lesson discussion streams over Server-Sent Events, not over the socket.** One learner, one
request, one answer read as it is written: a `POST` whose response is `text/event-stream`. It
reuses the REST route's session cookie, guards, validation pipe and error codes, every check that
can fail answers with a status before the stream opens, and closing the response cancels the
Gemini call. A socket would add a second authentication, validation and error path for a
one-to-one exchange. The browser reads it with `fetch` and a stream reader, since `EventSource`
only sends `GET`.

### The split

| | Transport | Examples |
|---|---|---|
| **Everything CRUD** | REST, Nest controllers, documented in Swagger | `POST /api/courses`, `GET /api/courses/:lang/today`, `GET /api/courses/:lang/lessons`, `GET` and `POST /api/courses/:lang/lessons/:id/attempt`, `POST …/attempt/pages/:index` |
| **One answer, streamed** | Server-Sent Events on a `POST` | `POST /api/courses/:lang/lessons/:id/discussion`: `delta`, `done` or `error`, and a heartbeat |
| **Everything live** | socket.io on `/ws` | `course:updated`, `friend:request`, `friend:accepted`, `friend:removed`, `presence:update`, `dm:message`, `dm:unread` and `app:error` from the server; `dm:send` (with an ack) and `dm:read` from the browser |

**The course stays in the path, and the API is language-neutral.** No read route takes a `locale`
parameter. A lesson is written in one language, the course's, like a question in the bank, so the
response is the same for every interface language. The web app translates the page around the
lesson. Two places use the interface locale on purpose: `POST …/attempt { locale }` sends it to fix
the attempt's mother tongue, and the discussion, whose body carries no locale, reads the session
user's and answers in it.

**No route takes a score.** The server runs every lesson attempt under
`/api/courses/:lang/lessons/:id/attempt`: it sends only the page the learner is on, checks every
answer, owns the exam timer, and when the last page locks it records the score from the answers it
stored, keeping the best one, and counts the lesson toward today's goal. The finish and its goal
rules come with [#82](https://github.com/VictorBro/ft_transcendence/issues/82), the attempt with
[#145](https://github.com/VictorBro/ft_transcendence/issues/145); [content/lessons.md](../content/lessons.md) §10 has
the details.

### Gateway rules

The contract already exists in [packages/shared/src/events/socket.ts](../../packages/shared/src/events/socket.ts) -
event names, Zod payload schemas, `ServerToClientEvents` / `ClientToServerEvents`, `SocketData`.
Use it. Four rules:

1. **Mount with `path`, not `namespace`.** `path` is the HTTP endpoint engine.io listens on;
   `namespace` is a logical channel multiplexed over it. The Caddyfile routes `/ws/*` to the
   api, so the gateway is `@WebSocketGateway({ path: '/ws' })` and the client is
   `io({ path: '/ws' })`. Namespaces are for later, if two kinds of traffic ever need separating.
2. **Authenticate the handshake.** The same express-session middleware the REST side runs reads
   the signed session cookie (same origin, so the browser sends it), the Origin must be ours
   (same-site is not same-origin), and the socket gets `SocketData { userId, sessionId }`. An
   unauthenticated socket is refused at the handshake, never connected.
3. **Parse every inbound payload with the shared Zod schema.** `CLIENT_EVENT_SCHEMAS` exists for
   this. Anything arriving on a gateway is untrusted, including from our own client.
4. **Rate-limit per socket.** `@nestjs/throttler`'s guard is HTTP-only; socket events bypass it
   entirely. See §6.

---

## 4. Redis: what it holds

Redis is already in the stack. It is not one thing but several, with different lifetimes.

**Redis is here for expiry, not for sharing.** The api runs as a single replica and is meant to:
one machine, one `docker compose up`, no orchestrator. Nothing below is in Redis so that a second
process can read it. Every key is hot, disposable and expiring, which is a shape that wants a
store with a TTL however many replicas there are. The rule of thumb, when something new comes up:
if it has to survive from one request to the next, it is Redis or Postgres, and losing it costs a
redo rather than data; if it does not, it is a plain constant or a per-request value in code.

| Job | Keys | Why Redis and not Postgres | Status |
|---|---|---|---|
| **Session store** (`connect-redis`) | `sess:<sid>` | Sessions are hot, short-lived and disposable. Restarting the api must not log everyone out | in use |
| **Placement run state** | `user:<id>:eval`, `user:<id>:eval_questions`, `user:<id>:eval_lock` | The search bounds, the level being probed, the tally per category, the mistakes so far, the current question's deadline and the report. **Always with a TTL**: one hour (`PLACEMENT_REDIS_KEY_TTL`) for `eval` and `eval_questions`, and 5 s (`PLACEMENT_LOCK_TTL_SECONDS`) for `eval_lock`, the `SET NX EX` lock that keeps two starts or two answers of one learner from racing. Keyed by the user, not by the session as first planned, so a learner who signs in again within the hour comes back to the exam they left. It lives exactly as long as the exam, so a table would be a row deleted minutes after it was written, and the TTL doubles as the abandoned-exam cleanup | in use (#48) |
| **Lesson discussion limits** | `discussion:user:<id>:minute`, `discussion:user:<id>:day`, `discussion:global:minute` | Fixed-window counters: the first message creates the key with its TTL (60 s or 24 h), `INCR`, `EXPIRE … NX` and `TTL` in one `MULTI`, so a crash never leaves a counter without expiry. The TTL is also the `Retry-After` | in use (#150) |
| **Presence** | `presence:<id>` | A socket count per user: `INCR` on connect, `DECR` 10 s after a disconnect, so a reload never shows as leaving. Every count is deleted at boot, since a crash never took its sockets back (one API instance assumed). See architecture/overview.md §4 | in use (#157) |
| **Throttler counters** | none | `@nestjs/throttler` runs without a storage adapter, so its counters sit in process memory. Correct for one replica; the only cost is that a restart clears everyone's limit | not in Redis, by choice |

Not built, and no longer planned: an LLM response cache and a per-user token budget. Lessons are
authored, so there is no generated explanation or exercise set to cache, and the discussion's
limits stand in for the budget (§5).

---

## 5. The AI layer

### Provider

`LLM_PROVIDER` picks the implementation of `LlmProvider` once, at boot (`createLlmProvider` in
`apps/api/src/llm/llm.factory.ts`), and a bad value stops the start:

| `LLM_PROVIDER` | Placement restock | Lesson discussion | Used by |
|---|---|---|---|
| `fixture` (default) | Writes no question: the draw falls back to the oldest question seen | One canned answer, streamed. Special messages (`#fail-midstream`, `#timeout`, `#blocked`) trigger each failure, for the specs | Development, CI, every test |
| `gemini` | One structured call per cell running low | Gemini's answer, streamed | A server with a key |
| `disabled` | Like the fixture | Every message ends with `error { code: "llm.disabled" }` | A server that runs no LLM at all |

`LLM_API_KEY` is required with `gemini`, and the api refuses to start without it. `LLM_MODEL` is
the Gemini model id; **empty means `gemini-3.6-flash`** (`DEFAULT_GEMINI_MODEL`). The provider and
model in use are exported as `ft_llm_provider_info{provider, model}`. The deployment compose file
requires `LLM_PROVIDER` to be set: there is no silent fallback on a server
([operations/deployment.md](../operations/deployment.md) §5).

**The key.** It lives in `.env` as `LLM_API_KEY` and nowhere else, and is sent in a request header,
never in a URL. A key that has been pasted into a chat, a doc or a ticket is burned: rotate it.
gitleaks guards commits, not conversations.

**What reaches Google.** The discussion sends the learner's messages, the earlier turns, the
lesson's teaching fields and the learner's wrong practice answers. Never an email, a display name or
a user id.

**A free key, decided 2026-11-20 (#204).** Verified 2026-08-22: Gemini's free tier allows roughly
30 requests a minute and 1,500 a day per key. In practice the key refused calls after fewer than 10
in two minutes, which is why `LLM_DISCUSSION_GLOBAL_PER_MINUTE` defaults to 5 (Google AI Studio
shows the current quota). On the free tier **Google may use prompts and outputs for
training and human review**; paid tiers are not used for training. The Privacy Policy says so
(`/privacy`, section 4), and it is a rejection criterion in its own right. Moving to a paid key,
a few tens of euros for the whole project at our volume, is therefore a policy change: section 4
in en, fr and de, and its `lastUpdated`, in the same pull request as the key.

### Two call shapes

Structured output and streaming pull in opposite directions: you cannot validate JSON until it
is complete. The interface resolves it with two methods rather than in every call site:

```ts
interface LlmProvider {
  // Validated JSON: the placement bank restock. The Zod schema comes from @ft/shared.
  generateStructured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>>;

  // Prose, piece by piece: the lesson discussion.
  streamText(request: StreamRequest): AsyncIterable<string>;
}

interface StreamRequest {
  purpose: LlmPurpose;          // 'lesson-discussion'
  system: string;               // the tutor's prompt, built on the server
  messages: LlmMessage[];       // { role: 'user' | 'assistant', text }, oldest first
  maxOutputTokens: number;      // 1,000 for the discussion
  signal: AbortSignal;          // aborted when the learner leaves
}
```

| Step | Shape | Purpose label | Why |
|---|---|---|---|
| Placement bank restock | structured | `question-batch:<category>` | It has fields: question, options, answer. Schema-validated, deduplicated, then written to `QuestionBank` |
| Lesson discussion | **stream** | `lesson-discussion` | It is prose, and reading it as it is written is the point |
| Scoring an attempt | computed in code | none | Not an LLM call at all |

Gemini's `streamText` calls `streamGenerateContent?alt=sse` and yields each text part as it
arrives. A failure is an `LlmError` with a fixed `reason` (`unreachable`, `rate_limited`,
`http_error`, `blocked`, `incomplete`, `invalid`, `disabled`), which the metrics count and the
discussion route turns into an `llm.*` error code. The learner leaving aborts the call, so Google
stops writing an answer nobody reads, and counts no outcome. Every call times out after 90 s.

### The lesson discussion, end to end

```mermaid
sequenceDiagram
    participant W as Discussion window (web)
    participant A as DiscussionController (api)
    participant R as redis
    participant P as db
    participant G as Gemini

    W->>A: POST /api/courses/:lang/lessons/:id/discussion<br/>{ attemptId, message, history }
    A->>P: course, ready lesson, attempt on its discussion page?
    alt fails
        A-->>W: 404 / 409 JSON error
    end
    A->>R: INCR each window in turn, stopping at the first over its limit
    alt over a limit
        A-->>W: 429 { retryAfter } + Retry-After
    end
    A-->>W: 200 text/event-stream
    A->>G: streamGenerateContent?alt=sse<br/>system prompt + turns, 1,000 tokens max
    loop each piece
        G-->>A: text
        A-->>W: event: delta { text }
    end
    A-->>W: event: done {} (or event: error { code })
```

### Cost control

1. `LLM_PROVIDER=fixture` in CI and in every unit and e2e test. No test spends money.
2. **Lessons are authored offline**, with Claude Code on members' own subscriptions
   ([content/lessons.md](../content/lessons.md) §7). The app's key never writes one.
3. **The discussion's limits**, counted in Redis before any LLM call: per learner 2 a minute and 60
   a day, and 5 a minute for everyone together, all changeable in `.env`. Over one: 429, with
   `retryAfter`.
4. **Capped answers**: 1,000 output tokens, a 500-character message, the last 10 turns.
5. **Visible spend**: `ft_llm_requests_total`, `ft_llm_tokens_total` and
   `ft_llm_discussion_limited_total` on the Learning dashboard, and the `LlmErrorRateHigh` alert
   ([operations/monitoring.md](../operations/monitoring.md)). No table records LLM calls.

**Placement items are not cached by content.** Caching them would hand every learner the same
test and break §1.2. Their reuse mechanism is the item bank plus per-user exclusion.

---

## 6. Throttling: four separate jobs

`@nestjs/throttler` is installed and globally bound. Four jobs, and only the first is obvious:

| Where | Against what | How |
|---|---|---|
| **Auth endpoints** | Credential stuffing and TOTP brute force | Per address: `LOGIN_LIMIT_PER_MINUTE` (5), `SIGNUP_LIMIT_PER_MINUTE` (20), tighter than the global `RATE_LIMIT_PER_MINUTE` (100) per account or address |
| **The lesson discussion** | Money, and the shared key's quota | Its own Redis windows, after every 404 and 409 check, so a refused request uses up nothing: `LLM_DISCUSSION_USER_PER_MINUTE` (2), `LLM_DISCUSSION_USER_PER_DAY` (60), `LLM_DISCUSSION_GLOBAL_PER_MINUTE` (5). Each hit counts in `ft_llm_discussion_limited_total{limit}` |
| **Socket events** | `dm:send`, `dm:read`. **The HTTP guard does not cover these**: a socket connection is one HTTP upgrade, so a client can emit thousands of events through a single allowed request | The gateway's own screen limits each socket to 20 of each event per 10 s, and each has a budget per account: 30 `dm:send` and 100 `dm:read` a minute (architecture/overview.md §4) |
| **Public API** | The module *requires* rate limiting | Not claimed (§2) |

Every limit is read once at boot; anything but a whole number stops the api.

---

## 7. Data model

**Ten tables beside `User` and `RecoveryCode`, all migrated** (`apps/api/prisma/schema.prisma`):
`UserLevel`, `QuestionBank` and `UserSeenQuestion` from Milestone 1; `Lesson`, `LessonResult`,
`LessonAttempt` and `UserAchievement` from Milestone 2; `Friendship`, `Conversation` and `Message`
from Milestone 3. The rule applied throughout: a table earns its place by being read at runtime,
and a 1:1 relationship is a column, not a table. There are no SQL views; the "views" of the lesson
player are Zod schemas of what the browser may see ([content/lessons.md](../content/lessons.md) §10,
[milestone2-data-model.html](../site/milestone2-data-model.html#player)).

Everything is UUID-keyed, with five exceptions. `LessonResult`, `UserAchievement`, `Friendship`
and `Conversation` are keyed by their pair (`(userLevelId, lessonId)`, `(userLevelId, code)`, and
for the last two the two user ids, smaller first), because the pair is what makes a row unique.
`Lesson` is keyed by its authored id (`de-separable-verbs`), because it is seeded from content and
results attach to it. Anything worth dating has `createdAt`, and every user-owned row cascades on
user delete, so deleting an account leaves nothing orphaned.

### 7.1 Languages

Two enums with the same three values today, because they answer two different questions:

```prisma
enum Locale   { en fr de }   // the language the interface is rendered in
enum Language { en fr de }   // the language being taught
enum Level    { A1 A2 B1 B2 C1 C2 }
```

`User.locale` is a display preference and follows next-intl's routing. `UserLevel.lang` and
`QuestionBank.lang` say what a learner is studying. An English speaker learning French sets one
to `en` and the other to `fr`, so collapsing them into one enum would make that row unsayable.
They drift apart for real the day a learnable language ships that the UI is not translated into,
and nothing has to change when it does.

**Both appear in the URL, and they mean different things.** The course is a path segment:
`/{locale}/learn/{lang}/…`, so `/fr/learn/de` is a French interface teaching German. Putting the
course in the path rather than in a column is what lets a link be shared, the back button work,
and two tabs sit on two courses at once. The header will therefore carry two language controls;
they have to read differently, along the lines of "Interface: English" against "Learning: German",
or nobody will know which one they just changed.

`User.activeLang` exists for one job only: deciding where a bare sign-in lands when the URL says
nothing. It is a convenience, not the source of truth, and any page that has a `lang` in its path
ignores it.

`User.timeZone` is an IANA zone (`Europe/Zurich`), sent by the browser and UTC by default. It
decides when the learner's day ends, so it is what every day in §1.3 is counted in. No other
user ever sees it.

**A learner studies several languages at once, so "has this person onboarded" is always a
question about `(userId, lang)`.** Someone who has finished French and is adding German still
needs onboarding for German. A check that asks only "does this user have any level at all" gets
that case wrong, silently, and only for the users who like the product most.

### 7.2 Learning

```mermaid
erDiagram
    User         ||--o{ UserLevel        : "learns"
    User         ||--o{ UserSeenQuestion : "was asked"
    QuestionBank ||--o{ UserSeenQuestion : "asked as"
    UserLevel    ||--o{ LessonResult     : "results of"
    Lesson       ||--o{ LessonResult     : "finished as"
    UserLevel    ||--o{ LessonAttempt    : "attempts"
    Lesson       ||--o{ LessonAttempt    : "attempted as"
    UserLevel    ||--o{ UserAchievement  : "earned"
```

| Table | Holds | Notes |
|---|---|---|
| `UserLevel` | id, userId, lang, level?, dailyGoal, streak, bestStreak, lastGoalDay?, **xp, lastChallengeDay?, lastChallengeCode?, challengesDone**, createdAt, updatedAt | Unique `(userId, lang)`: one row is one course, so a user may learn two languages. Onboarding writes it with `level` null; placement fills it in, or a learner who skips sets it directly. `streak`, `bestStreak` and `lastGoalDay` are the whole streak (§1.3). The four **gamification columns** (#95): `xp` the course's total, `lastChallengeDay` the course day the challenge was last done, `lastChallengeCode` the code it was done under, so a level change that day does not move it, and `challengesDone` the count the challenge achievements read. Finishing and goal changes take a row lock on this row (§9) |
| `QuestionBank` | id, sourceId?, lang, level, topic, category, readText?, question, options, answer, timeLimitS | The reusable pool, seeded from `content/items/*.json` and grown at runtime when a learner runs low in a cell. `sourceId` is the authored id the seed matches on, and its absence marks a question the LLM wrote. Full spec in [content/item-bank.md](../content/item-bank.md) |
| `UserSeenQuestion` | id, userId, questionId, createdAt, updatedAt | Unique `(userId, questionId)`. **The exposure record**, and the whole reason placement never repeats a question: the draw is a `NOT EXISTS` over these rows, and `updatedAt`, bumped on every serve, picks the oldest-seen fallback |
| `Lesson` | id, lang, level, position, kind, topic?, theme?, title, summary, brief, **content?**, **ready**, updatedAt | **The seeded catalogue, never written at runtime.** One row per outline entry, 3,990 in all. `brief` is `{}` and `content` null until the lesson's files exist; then they hold the parsed brief and content file. `content` stays null for a vocabulary lesson, whose lesson is built from its brief (#135). **`ready`** is set by the seed on every run: true when the files exist and pass `validateLesson`, 216 today (#84). `kind` is grammar, vocabulary, functions or reading; `topic` is set exactly on grammar lessons, `theme` exactly on the others. The lesson cards never send the brief or the content. Index on `(lang, level, position)`. Full guide in [content/lessons.md](../content/lessons.md) §4 |
| `LessonResult` | userLevelId, lessonId, score, day, finishedAt | Primary key `(userLevelId, lessonId)`: **one row per course and lesson, with no history.** Every finish upserts it: `score` keeps the best, `day` is the learner's day of the latest finish, `finishedAt` its moment. No row means not started, a best of 70 or more means passed, anything else failed. Today's count is the rows whose `day` is today. `lessonId` is `Restrict`: a lesson with results cannot be deleted |
| **`LessonAttempt`** | id, userLevelId, lessonId, motherTongue, secret, startedAt, page, deadline?, answers, completedAt?, results? | Unique `(userLevelId, lessonId)`: **the current or last attempt at a lesson**, run and scored by the server (#145). `motherTongue` is a `Locale`, fixed at the start. `secret` is 32 random bytes that key the refs naming units, options and tokens, and is never sent. `page` is the cursor and `deadline` that of the exam page at it. `answers` (JSON, `{}` at first) maps a unit id to its locked `{ response, outcome, points, timedOut, gender? }`, and `results` (JSON) is written once, when the last page locks. A retake replaces the row; a seed that changes the lesson deletes the unfinished ones. The plan is never stored: every request rebuilds it from the lesson row |
| **`UserAchievement`** | userLevelId, code, day, earnedAt | Primary key `(userLevelId, code)`, so an achievement is earned once and never lost (#95). `code` is one of the 16 `ACHIEVEMENTS` codes, a string fixed in code. `day` is the course day it was earned |

**There is no `Topic` table.** `enum Topic` already exists in the schema for the question bank,
and "topic" means one of its 13 grammar categories. On `Lesson` it labels grammar lessons only.
The order, the titles and the count of the lessons all live in `Lesson` itself.

**No table holds a discussion.** The lesson discussion is stateless: the browser sends the earlier
turns back with each message, and the server stores nothing of it. No table records LLM calls
either: the metrics do (§5).

### 7.3 Social

```mermaid
erDiagram
    User     ||--o{ Friendship    : "requests"
    User     ||--o{ Conversation  : "is in"
    Conversation ||--o{ Message   : "holds"
    User     ||--o{ Message       : "sends"
```

| Table | Holds | Notes |
|---|---|---|
| `Friendship` | pairKey, requesterId, addresseeId, status, createdAt, updatedAt | `pending / accepted`; declining, cancelling and removing delete the row. Keyed by the pair, smaller id first, so A to B and B to A cannot both exist |
| `Conversation` | pairKey, userAId, userBId, createdAt, lastMessageAt | One per pair who have exchanged a message, keyed like `Friendship`, so a pair cannot get two. `lastMessageAt` orders the list. It outlives the friendship: the history stays readable by both. Two users and no participants table, because group chat is not claimed |
| `Message` | id, pairKey, senderId, text, createdAt, readAt? | A direct message between friends (#158), 1 to 1,000 characters. `readAt` stays null until the other user reads it, and is never sent. The history pages on `(pairKey, createdAt, id)` |

Presence is **not** a table. It is a socket count per user in Redis, `presence:<id>` (§4).

`DailyStat` is **not built** either. Nothing tracks minutes: the daily goal counts `LessonResult`
rows by `day`, and the streak is three columns on `UserLevel` (§1.3).

### 7.4 What each module needs

Every claimed module (§2) runs on the twelve tables of the schema, Redis and the metrics. None needs
another table.

| Module | Pts | Tables it needs |
|---|---|---|
| Framework FE + BE | 2 | none |
| ORM | 1 | none, it is the mechanism |
| Standard user management | 2 | `User`, `Friendship` (+ Redis presence) |
| Complete 2FA | 1 | `User`, `RecoveryCode` |
| i18n, additional browsers, SSR | 3 | none |
| Complete LLM interface | 2 | `QuestionBank` (the restock), `Lesson` and `LessonAttempt` (the discussion's prompt and its guard) (+ Redis limits) |
| Real-time via WebSockets | 2 | `Conversation`, `Message` (+ Redis presence) |
| User interaction: chat, profiles, friends | 2 | `Conversation`, `Message`, `Friendship`, `User` |
| **Advanced search** | 1 | `Lesson` + `LessonResult`, searched in memory: a level has at most 320 lessons |
| **Gamification** | 1 | `UserAchievement`, plus `xp`, `lastChallengeDay`, `lastChallengeCode` and `challengesDone` on `UserLevel` |
| Monitoring | 2 | none: Prometheus keeps its own data |
| CI/CD, cloud deployment | 3 | none |

A table for a module nobody has committed to is the same mistake as a column for a mechanism
nobody can run, so the dropped modules of §2 add none.

## 8. What the skeleton already gives you

Nothing below needs rebuilding. This is what each piece is for, so nobody removes something
load-bearing.

| Piece | Purpose | Verdict |
|---|---|---|
| pnpm workspace + Turborepo | Cached per-package tasks, strict `node_modules` | keep |
| `apps/api` NestJS | All business logic and data access | keep, half a Major |
| `apps/web` Next.js | Presentation and SSR only | keep, half a Major |
| `packages/shared` | Zod contracts. One schema, validated on both sides | keep, **mandatory requirement**, and the socket contract already lives here |
| `packages/ui` | Component library | keep; the design system Minor is not claimed (§2) |
| `packages/{eslint-config,tsconfig}` | Shared presets. The two tsconfigs differ deliberately | keep |
| Caddy + internal CA | Single TLS entry, one origin, no CORS | keep, **HTTPS is mandatory** |
| Postgres 18 + pgvector | Relational data. pgvector is installed in the image and unused since RAG was dropped (§2) | keep |
| Redis | Sessions, placement runs, discussion limits, presence, see §4 | keep |
| Prisma 7 | ORM Minor; `schema.prisma` doubles as the README's schema section | keep |
| argon2 + express-session + connect-redis | Mandatory hashed/salted auth | keep |
| otpauth + qrcode-generator | 2FA Minor | keep, done |
| `@nestjs/swagger` | API docs at `/api/docs`, the SSE route included | keep |
| `@nestjs/throttler` | Four jobs, see §6 | keep |
| Playwright + console gate | The zero-console-errors **rejection criterion** | keep |
| CI: ci / e2e / hygiene / images / devcontainer | gitleaks, commitlint, `.env` hygiene, Prisma drift | keep |
| `LLM_PROVIDER` fixture / gemini / disabled | Free CI, deterministic tests, swappable vendor (§5) | keep |

## 9. Two things that will quietly cost you points

**SSR has to be demonstrable, not incidental.** App Router server-renders by default, but a page
built entirely from `'use client'` components ships an empty shell. To claim the Minor: keep the
marketing page, the daily goal page, the all lessons page and the profile pages as server
components fetching from the api, give them real `<title>`/meta, and check `view-source` shows
content. The all lessons page is a plain GET form, so it filters, sorts and pages with JavaScript
off. A demo where the evaluator disables JavaScript and still sees text is the whole argument.

**"Multi-user simultaneous support" is mandatory, not a module.** Two tabs finishing lessons at
the same moment, or many learners at once, must not corrupt each other's state. That means: a
row lock on the course (`SELECT ... FOR UPDATE` on its `UserLevel` row) around finishing and goal
changes, so two finishes that both reach the goal meet the day once and move the streak once;
`LessonResult`'s primary key `(userLevelId, lessonId)`, so a double-click cannot create two
results; and an e2e test that drives **two browser contexts at once** on one account. Write that
test early, it is the cheapest possible proof of a rejection-criterion requirement.

---

## 10. Build order, as it happened

The original plan built the lesson loop on an LLM tutor, then RAG. The Milestone 2 replan (#137)
swapped both for authored lessons and one streamed discussion. What was built, in order:

1. **Domain migration** and the seeded catalogues: `QuestionBank` from `content/items/`, then one
   `Lesson` row per outline entry (#79, #134).
2. **`LlmProvider` + fixture**, `generateStructured` first, with the Zod schemas in `@ft/shared`.
3. **Onboarding and placement** (Milestone 1): the binary search and bank sampling excluding
   `UserSeenQuestion`, on fixtures, then Gemini restocking the bank (#54).
4. **The roadmap** (Milestone 2): the rules as pure functions (#80), the reads and the search
   (#81), the finish and the streak (#82), the daily goal and all lessons pages (#86, #87).
5. **The lesson model and content**: the prototype's schemas and validators (#135, #136), the
   authoring kit (#83), French A1 and the ready flag (#84), then 12 lessons per level everywhere
   (#91 to #93).
6. **The lesson loop**: the player domain (#144), attempts scored on the server (#145), the lesson
   pages (#146 to #149), the discussion stream (#150) and its window (#151). `streamText` lands
   with #150.
7. **Gamification**: rules (#94), awards (#95), pages (#97).
8. **Socket gateway and social** (Milestone 3): gateway, friends, profiles, presence, messages
   (#154 to #158).

Every step before the first real Gemini call ran on fixtures, with no API key and no network, and
CI still does.
