# Product Architecture

The product, the modules, the AI layer and the schema. [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md)
covers the infrastructure around it: repository layout, containers, CI and build order.

The subject lists this project by name in chapter V.6:

> **Language Learning Platform**: Lessons, exercises, progress tracking, and peer practice.
> Point potential: 15+ points.

---

## 1. The learner journey

The product is one loop, repeated. Everything in this document exists to serve it.

```
sign up / log in  →  onboarding  →  placement   →    daily goal    →    lesson  →  daily goal …
                     (2 questions)  (binary search)  (today's lessons)  (teach → drill → score)
```

| Step | What the learner sees | What the system does |
|---|---|---|
| **Onboarding** | Two questions: which language to learn, and a daily goal (10, 30 or 60 minutes). Repeated per language, so adding a second course starts here again | Creates a `UserLevel` row for that `(user, language)`. `level` stays null until placement sets it. No AI call. |
| **Placement** | One question at a time, each with its own countdown, then a red and green report. Skippable by a learner who already knows their level, and overridable if they disagree with the result | Binary search over the six CEFR levels, in **our code**. Questions are multiple choice, so scoring is a string comparison, and the LLM is called only when the bank has nothing unseen left. Writes `UserLevel.level`. See §1.2 |
| **Daily goal** | Today's lessons from the level's syllabus: the ones that meet the goal, three extra, the streak and the level's progress. Nothing is locked: any lesson of the course language can be opened, and the all lessons page lists the whole level | Reads the seeded `Lesson` catalogue for (language, level) and the course's `LessonResult` rows, and proposes the lowest lessons not yet passed (§1.3). Writes nothing. No AI call. How the syllabus is sized and written is in [LESSONS.md](LESSONS.md) |
| **Lesson** | Tutor explains the lesson, shows examples, then drills exercises one at a time. Each answer comes back corrected, with the mistakes named. **This is the next milestone**: until it ships, a stub page finishes a lesson with a typed score | Explanation is RAG-grounded and streamed. Each exercise and each correction is a structured JSON call. |
| **Result** | The score, mistakes to review, and the lesson counted toward today's goal, pass or fail | Score computed **in code** from the `Exercise` rows. The course's `LessonResult` keeps the best score, and the streak moves when the goal becomes met. No AI call. |

### The rule that makes this work

> **The LLM generates and judges individual items. Our code owns state, scoring and
> progression.**

This is the spine of the whole design, and it is worth defending in one place because every
other decision follows from it:

- **It is explainable.** The subject requires you to explain your AI implementation at
  evaluation. "A binary search over the six CEFR levels, six questions per level, a second
  mistake ends the level" is explainable in one breath. "We asked the model to decide the level"
  is not.
- **It is testable.** With `LLM_PROVIDER=fixture` the entire progression is deterministic and
  unit-testable. Ask the LLM to own progression and nothing is testable without spending money.
  The proposal, the streak and level completion are pure functions with no clock and no database.
- **It is cheap.** Proposing today's lessons, keeping the best score, moving the streak, deciding
  that a level is complete, none of that needs a token.
- **It cannot embarrass you in a demo.** A model that decides to award B2 for a blank answer is
  a live failure. A binary search in TypeScript cannot.

### 1.2 Placement is a binary search, and never the same question twice

A placement run answers exactly one question: which of the six CEFR levels is this learner at.
It is a search in our code, not a judgment by the model.

**The search.** Keep the range of levels still possible, `lo = A1` and `hi = C2`, and probe the
middle of it. The first probe is therefore always B1.

- **Level passed:** everything above is still in play, so `lo = level + 1`.
- **Level failed:** everything below it is, so `hi = level - 1`.
- **`lo > hi`:** the search is over. The result is the highest level passed, or A1 if none was.

Three probes settle six levels, so a run is at most three levels deep.

**A worked run.** B1 is always the first probe. Six questions there, one of them wrong: that is
still a pass, so `lo` becomes B2 and the next probe is the middle of B2 to C2, which is **C1**.
Two wrong at C1: the level stops there, `hi` becomes B2, and the last probe is B2 itself. The
answer is B2 if it passes and B1 if it does not.

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
2. **Nothing unseen left in the cell, so generate one.** A structured LLM call, schema-validated,
   written to `QuestionBank` with no `sourceId`, then served. It stays, so the next learner to
   reach that cell gets it from step 1. **The bank grows as it is used**, and a null `sourceId`
   is what marks the rows no human reviewed.
3. **Generation failed** (API down or rate limited): serve the oldest question this learner has
   seen in that cell. This is the one path that repeats a question, and it opens only while the
   LLM is unreachable. A repeat after months is a weak measurement, and an abandoned exam is no
   measurement at all.

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
current level is stored, never a history of runs.

**The report is red and green.** At the end the learner sees every question they were asked,
their answer in red and the correct one in green. No explanations: nothing in the bank holds one.
It is built from the run state and dies with it.

**The run itself is not a table.** The bounds, the level being probed, the tally per category, the
mistakes so far and the report live in Redis under the learner's session, with a TTL (§4). Close
the session and the run goes with it. Two things outlive it: the `UserSeenQuestion` rows, and the
final level.

**The whole run, drawn.** A thick border is an LLM call. There is one, and it is reached only
when a learner has exhausted a cell.

```mermaid
flowchart TD
    start(["Placement starts"]) --> bounds["lo = A1, hi = C2"]
    bounds --> probe["Probe the middle level<br/><small>first probe is always B1</small>"]
    probe --> draw["Ask for one unseen question<br/><small>two each: vocabulary, grammar, reading</small>"]

    subgraph cascade["Drawing a question: a cascade, never a wall"]
        bank["1. The bank, excluding this<br/>learner's seen rows"]
        gen["2. Generate one, save it to<br/>the bank, serve it"]
        lru["3. This learner's oldest<br/>seen question"]
        bank -- "nothing unseen left" --> gen
        gen -- "LLM down or 429" --> lru
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
    passed --> over{"lo > hi?"}
    failed --> over
    over -- "no" --> probe
    over -- "yes" --> result["Highest level passed<br/><small>written to UserLevel.level</small>"]

    classDef llm stroke-width:3px
    class gen llm
```

### 1.3 The daily goal shapes the session, never the syllabus

**Ten, thirty or sixty minutes.** Picked at onboarding, changeable afterwards on the daily goal
page. A lesson is written to take about ten minutes, so **the goal counts lessons**: 10 means one
lesson finished that day, 30 means three, 60 means six. That is why those three values and not
others; ten divides all of them evenly. A finish counts pass or fail, from any list, and a lesson
finished twice in a day counts once. Nothing tracks minutes, and `DailyStat` is not built.

The goal does two things:

- **Sizes today's plan.** The daily goal page proposes as many lessons as the goal still needs,
  then three extra. They come from a queue over the current level: the lessons not finished
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
beyond it ([#94](https://github.com/VictorBro/ft_transcendence/issues/94)).

**The day is the learner's.** `User.timeZone` (an IANA zone sent by the browser, UTC by default)
decides when a day ends, so a learner in Tokyo and one in New York each get their own midnight. A
finish that arrives after local midnight counts for the new day. A course's day never goes
backwards: it is never before its `lastGoalDay` or its newest result's day, so a flight west
cannot undo a day that was already met.

**A level is complete when every lesson was attempted and at least 80% are passed.** A lesson is
passed when its best score is 70 or more. Only a complete level offers "Start B1": attempting
every lesson means the whole syllabus was seen, and 80% means it was learned, without asking for a
perfect score on each one. The learner can still change level, or retake placement, at any time.
**Switching level keeps all progress**: nothing is reset, and switching back continues where the
learner stopped.

**The syllabus is keyed by `(language, level)` and never by the goal.** Changing the goal
regenerates nothing and moves no progress: the same list of lessons is simply walked faster or
slower. A syllabus per goal would mean three copies of every level to generate and review, and a
learner dropping from 60 to 10 would need their finished lessons mapped onto a different list.
Every lesson takes about ten minutes, so none of that arises: no single lesson can overflow the
smallest goal. Every language has the same number of lessons per level, from 120 at A1 to 320 at
C2. How many there are, how they are split by kind and how they are written is in
[LESSONS.md](LESSONS.md).

What it must never do is gate content. A learner past their goal keeps going if they want; it
is a target, not a cap, and a cap would punish exactly the behaviour the product exists for.
**No lesson is locked either.** The order only decides which lessons are proposed: the learner can
open any lesson of the course language, and every finish counts.

### 1.4 Anatomy of a lesson, and where RAG runs in it

The lesson page is the milestone after the course roadmap. Until it ships, a stub page stands in
for it and finishes a lesson with a typed score (§3). The walkthrough for a learner with a
10-minute goal who opens "passé composé":

| Minute | What the learner sees | What the system does |
|---|---|---|
| 0:00 | Opens the lesson, from today's proposal or from the all lessons page | Reads the seeded `Lesson` row by its id, brief included, which the browser never sees. Nothing is written. No AI call |
| 0:01 | The intro streams in, with a "source" citation | **Cache lookup first**, keyed on the lesson id. On a hit, the explanation replays from Redis: no retrieval, no LLM, no cost. On a miss: retrieve top-k chunks filtered on the lesson's `(language, level, topic or theme)`, stream the grounded explanation, cache it for everyone |
| ~2:30 | First exercise appears | The exercise set was generated once per `(lesson id, seed)` as structured calls and cached the same way. Retrieved example sentences may serve as raw material at generation time |
| each answer | The correction, with the mistakes named | One structured call: `{ correct, mistakes[], correctedText }`. **No retrieval here**: the learner is waiting, and judging an answer against its expected answer needs no reference passages |
| whenever | Learner leaves mid-lesson | The answered `Exercise` rows attach to the course's `LessonResult` for this lesson, and a redo replaces them. The lesson page milestone decides how a lesson left halfway is saved and resumed |
| end | The score, and "Daily goal reached" with the streak day | Score computed in code from the `Exercise` rows, then the finish: the best score lands on `LessonResult`, the lesson counts toward today's goal, and the goal met moves the streak. No AI call. The next lesson is offered; the goal never gates |

Whether the explanation and exercise caches also key on the interface language is for the lesson
page milestone to decide.

So RAG runs in exactly three places, and two of them are invisible:

1. **Grounding the explanation**, on cache miss only. The first learner ever to open a B1
   passé composé lesson pays the retrieval and the generation; everyone after replays the cache.
2. **Sourcing exercise generation**, same cache-miss timing: retrieved level-graded sentences
   make better raw material than the model's imagination.
3. **"Ask the tutor"**, the free-form question box. The only interactive retrieval, because the
   question is different every time and cannot be cached.

Retrieval is a server-side step inside prompt assembly. The learner never sees it, except as the
citation under the explanation, which is also how the RAG module demonstrates itself at
evaluation.

### 1.5 The second mode: cross-language chat

The tutor is one half of the product. The other is two learners talking to each other, each in
their own language, with the AI in the middle.

```
Anna (de) types   "Ich bin gestern nach Berlin gefahren."
                            |
                            +-- corrected for Anna, her own mistakes named
                            +-- translated for Luc:  "Je suis allé à Berlin hier."
```

Anna never leaves German, Luc never leaves French, and both are reading real language written by
a real person rather than generated practice text. It is the feature that makes this a platform
rather than a quiz app, and it is what earns the real-time module: two clients, one shared
conversation, updates neither of them asked for.

Three things fall out of it:

**One LLM call per message, not two.** Correcting the sender and translating for the recipient is
a single structured call returning `{ corrected, mistakes[], translated }`. Two calls would double
the cost and the latency for no gain.

**The message sends before the AI answers.** `translated` and `correctedBody` are nullable and
filled when the call returns. A rate-limited or slow model must delay the translation, never the
message: a chat that blocks on an API is not a chat.

**Chat mistakes count.** The corrections here produce the same `Mistake` rows a lesson exercise
does, so "60% of your errors are verb agreement" covers how the learner actually writes, not only
how they answer drills. That is why `Mistake` hangs off either an exercise or a message.

This is also the strongest candidate if you ever need a **Modules of choice** entry: real-time
cross-language conversation with inline correction is substantial, and easy to justify.

---

## 2. Modules and points

14 required, bonus capped at +5, so **19 is the maximum that can count**. Anything beyond that
is insurance against a module failing on the day.

### Core, build these, in this order

| Module | Type | Pts | Status |
|---|---|---|---|
| Framework for frontend and backend | Major | 2 | done (Next.js + NestJS) |
| ORM | Minor | 1 | done (Prisma 7) |
| Standard user management | Major | 2 | partly done, profile, avatar, friends, online status |
| Complete 2FA | Minor | 1 | done |
| i18n, ≥3 languages | Minor | 1 | locales declared, `next-intl` not wired |
| Additional browsers (≥2) | Minor | 1 | Playwright projects + documentation |
| Complete LLM interface | Major | 2 | interface exists, no provider |
| Real-time via WebSockets | Major | 2 | route reserved, no gateway |
| Complete RAG system | Major | 2 | pgvector installed, no corpus |
| User interaction: chat, profiles, friends | Major | 2 | not started |
| | | **16** | |

### Buffer, pick from these once the core is green

| Module | Type | Pts | Why it fits |
|---|---|---|---|
| SSR | Minor | 1 | App Router already server-renders; needs deliberate proof (see §9) |
| Advanced search | Minor | 1 | The all lessons page: filters (status, kind, topic, theme, text), sort, group, and numbered pages of 20 in the URL, over the current level. It runs in memory, because a level has at most 320 lessons |
| User activity analytics dashboard | Minor | 1 | `LessonResult` and `Mistake` hold the progress to chart. `DailyStat` is not built |
| Gamification | Minor | 1 | Claimed: XP and ranks, a daily challenge and achievements, per course ([#94](https://github.com/VictorBro/ft_transcendence/issues/94), [#95](https://github.com/VictorBro/ft_transcendence/issues/95), [#97](https://github.com/VictorBro/ft_transcendence/issues/97)). A streak alone is not one of the subject's items. **Check with staff** that it counts outside a game: it sits in the gaming chapter but, unlike its four neighbours, carries no "requires a game" note |
| Custom design system (≥10 components) | Minor | 1 | `packages/ui` is already the place |
| Notification system | Minor | 1 | Needs the socket layer, which the core already builds |
| Public API | Major | 2 | Swagger + throttler already in the stack; needs API keys and 5 documented endpoints |
| Advanced analytics dashboard | Major | 2 | Charts, real-time, CSV/PDF export, a superset of the minor one |

Core 16 + four cheap minors ≈ **20 claimable**, one point of slack above the 19 ceiling and six
above the 14 floor. That is the target.

**Explicitly out**: OAuth, RTL, every gaming module except Gamification, WAF/Vault, ELK,
Prometheus, microservices, blockchain, file upload, PWA, WCAG AA, voice, image recognition.

---

## 3. Transport: what is REST and what is a WebSocket

This is the question that decides the shape of the codebase, so it gets a straight answer.

**Most of this product is request/response.** Onboarding, today's lessons, starting a lesson,
submitting an answer, reading progress, all of that is HTTP. A tutor that answers one learner is not
"real-time" in the sense the subject means; the module asks for *"real-time updates across
clients"* and *"handle connection/disconnection gracefully"*, which is a multi-client claim.

So the socket layer has to earn its keep on genuinely multi-client surfaces. It does, on four:

| Surface | Why it must be a socket | Serves module |
|---|---|---|
| **Cross-language chat**, each learner writing their own language, the AI translating and correcting between them (§1.5) | Two clients, one conversation, sub-second echo | Real-time (Major) |
| **Chat** | Same | User interaction (Major) |
| **Presence**, friends' online status | Server pushes state changes nobody polled for | User management (Major) |
| **Notifications** | Same | Notification system (Minor) |

**Tutor token streaming rides on the same socket.** Not because it must, Server-Sent Events
would do, but because a second transport means a second authentication path, a second
reconnection story and a second cancellation path, for no gain. One gateway, one handshake, one
`disconnect` handler is less code and a much shorter answer at evaluation.

### The split

| | Transport | Examples |
|---|---|---|
| **Everything CRUD** | REST, Nest controllers, documented in Swagger | `POST /api/courses`, `GET /api/courses/:lang/today`, `GET /api/courses/:lang/lessons`, `PUT /api/courses/:lang/lessons/:id/result` |
| **Everything live** | socket.io on `/ws` | `tutor:stream`, `session:join`, `chat:send`, `presence:update`, `notification:new` |

**The course stays in the path, and the API is language-neutral.** No route takes a `locale`
parameter. A lesson is written in one language, the course's, like a question in the bank, so the
response is the same for every interface language. The web app translates the page around the
lesson, never the lesson.

**Finishing a lesson is one route.** `PUT /api/courses/:lang/lessons/:id/result` with
`{ score }` records the score on the course's result for that lesson, keeping the best one, and
counts the lesson toward today's goal. It stays reachable only behind `LESSON_STUB` until the
lesson page ships: the flag is on in development and CI and never set on the public server, and
the stub lesson page posts a typed score to it. The lesson page then finishes through the same
service, with the score from its exercises.

The REST half is also what the **Public API** module documents, if you take it. That is a
reason to keep the domain reachable over HTTP even where a socket would do.

### Gateway rules

The contract already exists in [packages/shared/src/events/socket.ts](../packages/shared/src/events/socket.ts) -
event names, Zod payload schemas, `ServerToClientEvents` / `ClientToServerEvents`, `SocketData`.
Use it. Four rules:

1. **Mount with `path`, not `namespace`.** `path` is the HTTP endpoint engine.io listens on;
   `namespace` is a logical channel multiplexed over it. The Caddyfile routes `/ws/*` to the
   api, so the gateway is `@WebSocketGateway({ path: '/ws' })` and the client is
   `io({ path: '/ws' })`. Namespaces are for later, when tutor and chat want separating.
2. **Authenticate the handshake.** A guard reads the same signed session cookie the REST side
   uses, same origin, so the cookie is sent automatically, and populates
   `SocketData { userId, locale }`. An unauthenticated socket is disconnected, not tolerated.
3. **Parse every inbound payload with the shared Zod schema.** `CLIENT_EVENT_SCHEMAS` exists for
   this. Anything arriving on a gateway is untrusted, including from our own client.
4. **Rate-limit per socket.** `@nestjs/throttler`'s guard is HTTP-only; socket events bypass it
   entirely. See §7.

---

## 4. Redis: six distinct jobs

Redis is already in the stack. It is not one thing, it is six, and they have different
lifetimes.

**Redis is here for expiry, not for sharing.** The api runs as a single replica and is meant to:
one machine, one `docker compose up`, no orchestrator. Nothing below is in Redis so that a second
process can read it. Every row is hot, disposable and expiring, which is a shape that wants a
store with a TTL however many replicas there are. The rule of thumb, when something new comes up:
if it has to survive from one request to the next, it is Redis or Postgres, and losing it costs a
redo rather than data; if it does not, it is a plain constant or a per-request value in code.

| Job | Why Redis and not Postgres | Status |
|---|---|---|
| **Session store** (`connect-redis`) | Sessions are hot, short-lived and disposable. Restarting the api must not log everyone out | in use |
| **Throttler counters** | Per-minute counters with a TTL | not yet: `@nestjs/throttler` runs without a storage adapter, so counters sit in process memory. Correct for one replica; the only cost is that a restart clears everyone's limit. Moving them is optional, not pending work |
| **LLM response cache** | Keyed on the lesson id and a seed. The same B1 *passé composé* explanation is generated once and served to everyone. Whether the key also carries the interface language is for the lesson page milestone to decide. The single biggest cost lever in the project | to build |
| **Per-user token budget** | An atomic counter with a daily TTL, checked by a guard before any LLM call | to build |
| **Presence** | `SETEX user:{id}:online` refreshed by socket heartbeat. Expiry *is* the disconnect detection, including for a client that vanished without a `disconnect` | to build |
| **Placement run state** | The search bounds, the level being probed, the tally per category, the mistakes so far, the current question's deadline and the report. **Keyed by the session, never by the user, and always with a TTL.** Keyed by the user it would outlive the login that started it and a learner would come back to a half-finished exam; keyed by the session it goes when they go, which is what was asked for. It lives exactly as long as the exam, so a table would be a row deleted minutes after it was written, and the TTL doubles as the abandoned-exam cleanup | to build |

---

## 5. The AI layer

### Provider

`LLM_PROVIDER` stays `fixture | cached | real`, and CI stays on `fixture` forever. The vendor is
one file behind the `LlmProvider` interface. Team decision: **Gemini 3.1 Flash-Lite**, chosen
for native JSON-schema output and price.

Verified 2026-08-22: the model has a real free tier, roughly 30 requests/minute and 1,500/day
per key, and on the free tier **Google may use prompts and outputs for training and human
review**. Paid tiers are not used for training. That one clause has three consequences:

1. **The Privacy Policy must say it.** Learner-typed text (answers, tutor chat) is sent to
   Google and may be used to train models. The Privacy Policy is a rejection criterion in its own
   right. Disclose it now, or budget for the paid tier where
   the clause does not apply; at our volume the paid cost is a few tens of euros for the whole
   project.
2. **Never put identity in a prompt.** Email, display name and user id have no business in any
   prompt. The tutor needs the lesson's level and brief and the learner's answer text, nothing
   else.
3. **30 RPM is a platform-wide ceiling on one key.** The Redis exercise cache and the per-user
   budget guard stop being cost optimisations and become what keeps a multi-user demo alive.
   The provider should catch a 429 and degrade to `cached` rather than surface an error
   mid-lesson.

Still to record in [VERSIONS.md](VERSIONS.md) before the first real call:

1. **Pin the exact model id**, the dated snapshot, not the floating alias: a silently rotated
   model changes behaviour under a green test suite.
2. **Pin the embedding model and its dimension separately.** The vector column's dimension is
   fixed in a migration; changing the embedding model later means re-embedding the whole corpus
   and a new migration.
3. **Key hygiene.** The key lives in `.env` as `LLM_API_KEY` and nowhere else. A key that has
   been pasted into a chat, a doc or a ticket is burned: rotate it. gitleaks guards commits,
   not conversations.

### Two call shapes, not one

Structured output and streaming pull in opposite directions, you cannot validate JSON until it
is complete. Resolve it in the interface rather than in every call site:

```ts
interface LlmProvider {
  // Validated JSON. Used for placement items, exercises, corrections, judgments.
  // The Zod schema comes from @ft/shared and is also what the client parses.
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;

  // Prose, token by token. Used for the tutor's explanation and for peer-practice hints.
  streamText(req: TextRequest): AsyncIterable<string>;
}
```

Which shape each step uses:

| Step | Shape | Why |
|---|---|---|
| Placement item | structured | It has fields: prompt, skill, target level |
| Lesson explanation | **stream** | It is prose, and watching it appear is the demo |
| Exercise generation | structured | Rendered as a form, not as text |
| Answer correction | structured | `{ correctedText, mistakes[], encouragement }`, the mistakes drive analytics |
| Lesson summary | computed in code | Not an LLM call at all |

Every structured response is parsed with the **same Zod schema the client uses**. That is what
`packages/shared` is for, and it satisfies the mandatory "validated on both sides" requirement
for free.

### RAG, and what the corpus actually is

The module wants *"a large dataset"*, *"users can ask questions and get relevant answers"*,
*"proper context retrieval and response generation"*. For this product the corpus is **curated
reference content we author or source**, never user data:

- grammar reference: rules, conjugation tables, usage notes, exceptions
- graded example sentences per CEFR level
- vocabulary sets with usage and collocations
- a catalogue of common learner errors and their explanations

RAG is not decoration here. Two places it does real work:

1. **Grounding explanations.** Models are confidently wrong about grammar exceptions. Retrieving
   the actual rule text and putting it in the prompt is the difference between a tutor that
   teaches and one that misleads. Cite the source chunk in the UI and the module demonstrates
   itself.
2. **"Ask the tutor"** free-form questions, *"when do I use passé composé instead of
   imparfait?"*, which is literally the module's own description.

### How it works, mechanically

Two pipelines that never run at the same time.

**Ingest: offline, rerun only when content changes.** A seed-time script, not a service.

1. Read the source files from the repo (table below).
2. Split into chunks of a few hundred words, one idea per chunk: whole documents do not fit a
   prompt, and the chunk is the unit of retrieval.
3. Embed each chunk. The embedding model returns a vector of N numbers encoding what the chunk
   *means*, so chunks about similar things get numerically similar vectors.
4. Store text and vector in `DocumentChunk.embedding vector(N)`, HNSW index on the column.

```mermaid
flowchart LR
    subgraph src["Source files, committed to git"]
        notes["Grammar notes,<br/>written by us"]
        tato["Tatoeba sentences,<br/>CC BY"]
        wikt["Wiktionary tables,<br/>CC BY-SA"]
    end

    notes --> chunk
    tato --> chunk
    wikt --> chunk
    chunk["Split into chunks<br/><small>a few hundred words,<br/>one idea each</small>"]
    chunk --> embed["Embedding model<br/><small>meaning becomes vector(N)</small>"]
    embed --> store[("DocumentChunk<br/><small>text + embedding,<br/>HNSW index</small>")]

    classDef llm stroke-width:3px
    class embed llm
```

**Retrieve: per request, inside the tutor.**

1. Embed the learner's question (or the lesson's summary) with the same model.
2. Nearest-neighbour query, plain SQL thanks to pgvector:

```sql
SELECT content, "documentId"
FROM "DocumentChunk"
WHERE language = $1 AND level = ANY($2)
ORDER BY embedding <=> $3   -- cosine distance, served by the HNSW index
LIMIT 5;
```

3. Put those chunks in the prompt: "answer using only these reference passages, cite the one
   you used". The model answers from our verified text instead of its memory, the UI shows the
   citation, and correcting a grammar note corrects every future answer with no retraining.

```mermaid
flowchart LR
    q["Learner question,<br/>or the lesson's summary"] --> qe["Embed the question<br/><small>same model as ingest</small>"]
    qe --> nn["Nearest-neighbour SQL<br/><small>top 5 by cosine distance,<br/>filtered on language and level</small>"]
    store[("DocumentChunk")] --> nn
    nn --> prompt["Prompt: answer only from these<br/>passages, cite the one you used"]
    prompt --> model["Gemini"]
    model --> ui["Streamed answer,<br/>citation shown in the UI"]

    classDef llm stroke-width:3px
    class qe,model llm
```

This is search by meaning, not by keyword: a question about "past tense" finds the chunk about
the passé composé because their vectors are close, where a keyword search finds nothing.
`CREATE EXTENSION IF NOT EXISTS vector` belongs in the first migration that needs it; see the
note in [VERSIONS.md](VERSIONS.md).

**Where RAG is deliberately not used: the placement test and per-answer corrections.**
Both are interactive moments where a learner is waiting, and neither is improved by reference
passages: a correction judges the answer against its expected answer, and placement items come
from the item bank with judging as a plain structured call. Retrieval there would add latency exactly where a learner is
watching a spinner, and to placement it would also add a moving part to the one flow that must
be explainable in a sentence, without improving the level estimate. The single sensible touchpoint is offline:
when the bank runs dry and a fresh item is generated, retrieving a few level-graded example
sentences to base it on makes the item more faithful to its claimed level. Optional, and only
after bank, search and tutor all work.

**Same generator, two different stores.** Lesson exercises and placement items are both
LLM-generated, optionally RAG-grounded, so the natural question is why they are not handled the
same way. Because the artifacts have opposite jobs:

| | Lesson exercise | Placement item |
|---|---|---|
| Stored in | Redis cache, keyed `(lesson id, seed)` | `QuestionBank` rows |
| Reuse | Same set for every learner: repeating practice material is harmless | Never the same twice per learner, enforced against `UserSeenQuestion` |
| Human review | None: the correction loop absorbs a weak exercise, it costs one drill | Before seeding: an ambiguous item mislabels everyone who sees it |
| Comparability | Not needed | The point: generating a fresh test every time would measure March and May with different rulers |

The bank is placement's cache with per-user exclusion and a review gate, because its content is a
measuring instrument rather than practice material. The two flows meet in cascade step 2: an
exhausted level generates a fresh item exactly like an exercise, but writes it into the bank so
it is excluded from that learner's next test and reused for everybody else's.

**Never embed user-generated content into the shared index.** One learner's practice text
retrieved into another learner's lesson is a data leak, and a live one during a demo.

### Where the corpus comes from

Three sources, in descending order of how much of the corpus they should be:

| Source | Licence | Use it for |
|---|---|---|
| **Written by us** | ours | Grammar reference notes, one per (level, grammar topic) cell, shared by that cell's lessons. At most 78 cells (13 topics × 6 levels) × ~400 words for one language. This is the backbone and the part that is genuinely our work |
| **[Tatoeba](https://tatoeba.org)** | CC BY 2.0 FR | Graded example sentences. Millions of sentences with translations, downloadable as TSV. The single best source for authentic examples |
| **[Wiktionary](https://kaikki.org)** (via Wiktextract JSON) | CC BY-SA 4.0 | Conjugation tables, definitions, usage notes, false friends |

Also viable: **Wikibooks** language courses (CC BY-SA), **Universal Dependencies** treebanks for
grammatically annotated sentences, **OPUS** for parallel corpora.

**Drafting with the LLM is legitimate; skipping the human check is not.** Generating the grammar
notes with Gemini and having a speaker of the language verify each one is a reasonable division of
labour, and the README's Resources section must say so, the subject requires documenting how AI
was used and for which parts. An unverified generated corpus is exactly the failure mode chapter I
of the subject warns about, and it is worse here than usual: a wrong rule in the corpus is
retrieved and taught confidently to every learner.

**Do not use**: scraped commercial course content (Duolingo, Babbel, copyright), anything whose
licence cannot be named, or user-generated content from our own app.

### The evaluator has no API key

Embedding the corpus needs an embedding model, which needs a key. `make` must still work without
one, or the RAG module cannot be demonstrated at evaluation. Decide this before writing the ingest
script, because it shapes it:

1. **Commit embeddings for a demo subset.** The grammar reference alone is a few hundred chunks;
   at 768 dimensions that is roughly 1 MB of floats, which git handles fine. Seed loads them
   directly, no network, no key.
2. **Generate the rest at ingest time**, gated behind a key, for the bulk corpora that are too
   large to commit.
3. **The fixture provider returns deterministic pseudo-embeddings**, so unit and e2e tests
   exercise the retrieval path with no key and no spend.

That combination keeps `make` green on a clean clone and still lets the full corpus exist.

### Cost control

Four layers, all before feature work:

1. `LLM_PROVIDER=fixture` in CI and in every unit test. No test ever spends money.
2. Redis cache keyed on the lesson id and a seed, explanations and exercises are generated once,
   not once per learner.
   **Placement items are exempt.** Caching them by content key would hand every learner the same
   test and break §1.2 outright. Their reuse mechanism is the item bank plus per-user exclusion,
   which is a different thing that happens to look similar.
3. Per-user daily token budget in Redis, enforced by a Nest guard.
4. A global daily ceiling with a kill switch to `cached`, so a bug cannot drain the key overnight.

Every call writes an `LlmCall` row (tokens, latency, cache hit). That is how spend stays visible,
and it is a ready-made data source for the analytics dashboard.

---

## 6. Throttling: four separate jobs

`@nestjs/throttler` is already installed and globally bound. It is doing four different things,
and only the first is obvious:

| Where | Against what |
|---|---|
| **Auth endpoints** | Credential stuffing and TOTP brute force. Tighter limits than the global default |
| **LLM endpoints** | Money. This is the difference between a bug costing €2 and €200 |
| **Public API** | The module *requires* rate limiting as an explicit acceptance criterion |
| **Socket events** | `chat:send`, `tutor:answer`. **The HTTP guard does not cover these**, a socket connection is one HTTP upgrade, so a client can emit thousands of events through a single allowed request. Needs its own per-socket, per-event limiter |

That last row is the one that gets missed. Write it when the gateway is written, not after.

---

## 7. Data model

**Thirteen tables beside `User` and `RecoveryCode`, three of which are already migrated**
(`UserLevel`, `QuestionBank`, `UserSeenQuestion`). The course roadmap adds `Lesson`,
`LessonResult` and `UserAchievement`; the lesson page adds `Exercise` and `Mistake`; social,
content and operations add `Friendship`, `Message`, `Document`, `DocumentChunk` and `LlmCall`.
Every one is load-bearing for a module we claim. The rule applied throughout: a table earns its
place by being read at runtime, and a 1:1 relationship is a column, not a table.

Everything is UUID-keyed, with three exceptions. `LessonResult` and `UserAchievement` are keyed by
their pair (`(userLevelId, lessonId)` and `(userLevelId, code)`), because the pair is what makes
a row unique. `Lesson` is keyed by its authored id (`de-separable-verbs`), because it is seeded
from content and results attach to it. Anything worth dating has `createdAt`, and every
user-owned row cascades on user delete, so deleting an account leaves nothing orphaned.

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
    UserLevel    ||--o{ UserAchievement  : "earned"
    LessonResult ||--o{ Exercise         : "drills"
    Exercise     ||--o{ Mistake          : "names"
    Message      ||--o{ Mistake          : "also names"
```

| Table | Holds | Notes |
|---|---|---|
| `UserLevel` | userId, lang, level?, dailyGoal, streak, bestStreak, lastGoalDay?, xp, lastChallengeDay?, challengesDone | Unique `(userId, lang)`, so a user may learn two languages. Onboarding writes it with `level` null; placement fills it in, or a learner who skips sets it directly. The goal sizes today's plan and defines the streak, it never locks content. `streak`, `bestStreak` and `lastGoalDay` are the whole streak (§1.3); `xp`, `lastChallengeDay` and `challengesDone` are the gamification counters. All of them are per course, and finishing and goal changes take a row lock on this row (§9) |
| `QuestionBank` | id, sourceId?, lang, level, topic, category, readText?, question, options, answer, timeLimitS | The reusable pool, seeded from `content/items/*.json` and grown at runtime when a learner exhausts a cell. `sourceId` is the authored id the seed matches on, and its absence marks a question the LLM wrote. Full spec in [ITEM_BANK.md](ITEM_BANK.md) |
| `UserSeenQuestion` | userId, questionId | Unique `(userId, questionId)`. **The exposure record**, and the whole reason placement never repeats a question: the draw is a `NOT EXISTS` over these rows. It is per user and not per run, so a retake cannot serve an old question either |
| `Lesson` | id, lang, level, position, kind, topic?, theme?, title, summary, brief | **The seeded catalogue, never written at runtime.** One row is one lesson of the syllabus, seeded from `content/lessons` by `db:seed`. `id` is the authored key: the language and a few English words, no level, so a lesson can move level and keep its results. It is permanent once on `main`. `kind` is grammar, vocabulary, functions or reading; `topic` (the `Topic` enum) is set exactly on grammar lessons, `theme` exactly on the others. **One language per lesson**: everything in it is in the course language, like a question in the bank. `title` and `summary` are for the learner, `brief` is for the tutor and never sent to the browser. Index on `(lang, level, position)`. Full guide in [LESSONS.md](LESSONS.md) |
| `LessonResult` | userLevelId, lessonId, score, day, finishedAt | Primary key `(userLevelId, lessonId)`: **one row per course and lesson, with no history.** Every finish upserts it: `score` keeps the best, `day` is the learner's day of the latest finish, `finishedAt` its moment. No row means not started, a best of 70 or more means done, anything else failed. Today's count is the rows whose `day` is today |
| `UserAchievement` | userLevelId, code, day, earnedAt | Primary key `(userLevelId, code)`, so an achievement is earned once and never lost. `day` is the course day it was earned. The 16 codes are strings fixed in code |
| `Exercise` | userLevelId, lessonId, ordinal, type, prompt, options, expectedAnswer, learnerAnswer, correct, correctedText, feedback, answeredAt | The question, the answer and the correction in one row, because there is exactly one of each. Three tables here would be normalising a 1:1:1. Attaches to the course's `LessonResult` for that lesson, and a redo replaces the previous rows. The lesson page milestone decides the rest of its shape |
| `Mistake` | exerciseId?, messageId?, type, span, explanation | The one place a child table is right: one answer produces *many* mistakes and they must be countable by type in SQL. Exactly one of the two parents is set, a drill answer or a chat message, so the analytics cover how the learner writes and not only how they drill |

**There is no `Topic` table.** `enum Topic` already exists in the schema for the question bank,
and "topic" means one of its 13 grammar categories. On `Lesson` it labels grammar lessons only.
The order, the titles and the count of the lessons all live in `Lesson` itself.

**`Mistake.type` being a database enum rather than free text is the highest-leverage decision in
this schema.** It is what turns "the AI corrected me" into "60% of your errors are verb
agreement", which is simultaneously the analytics dashboard, the review suggestions, and the most
convincing thing you can put on screen at evaluation. The taxonomy comes from the team's own
prompt PoC and handles what French and German actually need:

```prisma
enum MistakeType {
  accents
  ligatures_diacritics_special_characters
  other_spelling
  punctuation
  grammatical_gender
  sentence_structure_and_word_order
  other_grammar
  expression_and_idiomatic_language
}
```

### 7.3 Social, content and operations

```mermaid
erDiagram
    User     ||--o{ Friendship    : "requests"
    User     ||--o{ Message       : "sends"
    Message  ||--o{ Mistake       : "corrected into"
    User     ||--o{ LlmCall       : "triggers"
    Document ||--o{ DocumentChunk : "chunked into"
```

| Table | Holds | Notes |
|---|---|---|
| `Friendship` | requesterId, addresseeId, status, respondedAt | `pending / accepted / blocked`. Unique on the ordered pair; enforce a canonical order so A to B and B to A cannot both exist |
| `Message` | senderId, recipientId, body, bodyLanguage, correctedBody?, translated?, sentAt, readAt | The cross-language chat of §1.5. `body` is what the sender typed; `translated` is it in the recipient's language, and both it and `correctedBody` are nullable so the message sends before the AI answers. One translation per message, because the conversation has two people in it. A `Conversation` plus a participants join table would buy group chat we are not claiming |
| `Document` | language, cefr?, title, kind, sourceUrl, licence, attribution, checksum | Source material for RAG. **`licence` and `attribution` are not optional**: a mixed corpus needs per-document provenance, and CC BY-SA text has to be credited wherever it surfaces. `checksum` makes re-ingest idempotent |
| `DocumentChunk` | documentId, level, topic?, theme?, ordinal, content, embedding `vector(N)` | HNSW index on `embedding`. `level` with `topic` or `theme` lets a lesson retrieve only its own cell's reference: one grammar note per (level, topic), shared by all of that cell's lessons |
| `LlmCall` | userId?, purpose, model, tokensIn, tokensOut, latencyMs, cacheHit, createdAt | Cost instrumentation, and the evidence at evaluation that spend is controlled. Cost in euros is derived from tokens and the price in config, not stored, because the price changes |

Presence is **not** a table. It is a Redis key with a TTL (§4).

`DailyStat` is **not built** either. Nothing tracks minutes: the daily goal counts `LessonResult`
rows by `day`, and the streak is three columns on `UserLevel` (§1.3).

### 7.4 What each module needs

The point of the cut: the 16-point core needs **no table beyond the thirteen**, and most of the
buffer modules need none either.

| Module | Pts | Tables it needs |
|---|---|---|
| Framework FE + BE | 2 | none |
| ORM | 1 | none, it is the mechanism |
| Standard user management | 2 | `User`, `Friendship` (+ Redis presence) |
| Complete 2FA | 1 | `User`, `RecoveryCode` |
| i18n, additional browsers, SSR | 3 | none |
| Complete LLM interface | 2 | `Lesson`, `LessonResult`, `Exercise`, `LlmCall` |
| Real-time via WebSockets | 2 | `Message` (+ Redis presence) |
| Complete RAG | 2 | `Document`, `DocumentChunk` |
| User interaction: chat, profiles, friends | 2 | `Message`, `Friendship`, `User` |
| **Activity analytics dashboard** | 1 | none new: `LessonResult` + `Mistake` |
| **Gamification** | 1 | `UserAchievement`, plus `xp`, `lastChallengeDay` and `challengesDone` on `UserLevel` |
| **Advanced search** | 1 | none new: `Lesson` + `LessonResult` |
| Notification system | 1 | +1 (`Notification`) |
| Public API | 2 | +1 (`ApiKey`, hashed like a password) |

Add those last two tables **with** their module, not before it. A table for a module nobody has
committed to is the same mistake as a column for a mechanism nobody can run.

## 8. What the skeleton already gives you

Nothing below needs rebuilding. This is what each piece is for, so nobody removes something
load-bearing.

| Piece | Purpose | Verdict |
|---|---|---|
| pnpm workspace + Turborepo | Cached per-package tasks, strict `node_modules` | keep |
| `apps/api` NestJS | All business logic and data access | keep, half a Major |
| `apps/web` Next.js | Presentation and SSR only | keep, half a Major |
| `packages/shared` | Zod contracts. One schema, validated on both sides | keep, **mandatory requirement**, and the socket contract already lives here |
| `packages/ui` | Component library | keep, the design system Minor lives here |
| `packages/{eslint-config,tsconfig}` | Shared presets. The two tsconfigs differ deliberately | keep |
| Caddy + internal CA | Single TLS entry, one origin, no CORS | keep, **HTTPS is mandatory** |
| Postgres 18 + pgvector | Relational data and the RAG index in one datastore | keep |
| Redis | Six jobs, see §4 | keep |
| Prisma 7 | ORM Minor; `schema.prisma` doubles as the README's schema section | keep |
| argon2 + express-session + connect-redis | Mandatory hashed/salted auth | keep |
| otpauth + qrcode-generator | 2FA Minor | keep, done |
| `@nestjs/swagger` | API docs; the Public API module needs them | keep |
| `@nestjs/throttler` | Four jobs, see §6 | keep |
| Playwright + console gate | The zero-console-errors **rejection criterion** | keep |
| CI: ci / e2e / hygiene / images | gitleaks, commitlint, `.env` hygiene, Prisma drift | keep |
| `LLM_PROVIDER` fixture/cached/real | Free CI, deterministic tests, swappable vendor | keep, now points at Gemini |

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

## 10. Build order

1. **Domain migration**, the §7 tables, the seeded `Lesson` catalogue and a starter
   `QuestionBank` for one language. Authored questions, no generation yet.
2. **`LlmProvider` + fixture**, `generateStructured` and `streamText`, plus the Zod schemas in
   `@ft/shared`. No vendor yet.
3. **Onboarding + placement**, the binary search and bank sampling excluding `UserSeenQuestion`.
   Entirely on fixtures. Both are plain unit tests: sit the exam twice as the same user and
   assert zero question overlap.
4. **Daily goal and all lessons pages**, server-rendered from `Lesson` and `LessonResult`.
5. **Lesson loop**, explanation, exercises, corrections, scoring. Still on fixtures.
6. **Wire Gemini**, flip `LLM_PROVIDER=real` behind the budget guard and the cache. First real
   spend happens here, with instrumentation already in place.
7. **Socket gateway**, auth guard, tutor stream, presence.
8. **RAG**, corpus files, ingest script, retrieval in the explanation prompt.
9. **Social**, friends, presence, and the cross-language chat of §1.5.
10. **Buffer modules**, pick from §2 by cost.

Steps 1 to 5 need no API key and no network. That is deliberate: four people can build the entire
product on fixtures while one person settles the vendor.
