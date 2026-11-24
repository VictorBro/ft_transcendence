# Chapter 6 — Talking to an AI model

In this chapter:

- What an LLM is, and what the API uses it for
- The "provider" pattern: one interface, several classes behind it (like power plug adapters)
- What streaming is, and why the tutor answer is streamed
- [llm.provider.ts](../../apps/api/src/llm/llm.provider.ts): the contract and the error type
- [llm.factory.ts](../../apps/api/src/llm/llm.factory.ts) and [llm.module.ts](../../apps/api/src/llm/llm.module.ts): how one provider is picked from the `.env` file
- [gemini.provider.ts](../../apps/api/src/llm/gemini.provider.ts): the real one (HTTP requests, streaming, errors, timeouts, metrics)
- [fixture.provider.ts](../../apps/api/src/llm/fixture.provider.ts) and [disabled.provider.ts](../../apps/api/src/llm/disabled.provider.ts): the fake ones, for tests and for a stack with no key
- Who uses the LLM in the rest of the API

---

## The big picture

### What is an LLM?

An **LLM** (Large Language Model) is a program trained on a huge amount of text. You send it text (a **prompt**),
and it writes text back. Gemini (by Google), GPT and Claude are LLMs. We do not run the model ourselves: it runs
on Google's servers, and we call it over HTTP, like any other web API.

The model reads and writes **tokens**. A token is a piece of a word (about 3 to 4 letters in English). Google
bills by the number of tokens: the tokens we send (the prompt) plus the tokens the model writes (the output).

A prompt has two parts in this project:

| Part     | What it is                                              | Example                                     |
| -------- | ------------------------------------------------------- | ------------------------------------------- |
| `system` | The rules and the role of the model. Same for many calls. | "You are an expert CEFR exam designer..."  |
| `user`   | The precise request (or the conversation, for the tutor). | "Write 13 B1 grammar questions in "fr"."   |

The API uses the LLM for **two jobs**:

1. **Writing placement questions** (chapter 7). The answer must be JSON with an exact shape, so the code can save
   it in the database. This is `generateStructured`.
2. **The lesson tutor** (chapter 8). The learner asks a question about the lesson, and the model answers in free
   text, shown word by word. This is `streamText`.

### The provider pattern: a power plug adapter

Think of a travel plug adapter. Your laptop charger has one plug. In France, Switzerland or the UK the wall socket
is different, so you put an adapter between them. The charger never changes: only the adapter does.

Here:

- The **charger** is the rest of the API (the question stock, the tutor). It only knows one "plug shape":
  the `LlmProvider` interface.
- The **adapters** are the classes that follow that interface: `GeminiProvider`, `FixtureProvider`,
  `DisabledProvider`.
- The **wall** is what is really behind: Google's servers, or nothing at all.

```mermaid
flowchart LR
    subgraph callers["Code that needs an LLM"]
        Q["QuestionStockService<br/>(writes questions)"]
        D["DiscussionService<br/>(lesson tutor)"]
    end
    I{{"LlmProvider<br/>interface"}}
    Q --> I
    D --> I
    I -.->|"LLM_PROVIDER=gemini"| G["GeminiProvider"] --> GO["Google Gemini API<br/>(HTTPS)"]
    I -.->|"LLM_PROVIDER=fixture<br/>(default)"| F["FixtureProvider<br/>no network"]
    I -.->|"LLM_PROVIDER=disabled"| X["DisabledProvider<br/>always fails"]
```

Why build it like this?

- **Changing vendor is a config change plus one file.** The `.env.example` file says it: "App code calls the
  LlmProvider interface, so swapping vendors is a config change plus one file."
- **Tests and local development need no key and no money.** With the fixture, nothing goes on the network.
- **One place for Google details.** HTTP, Google's JSON format and its error codes all live in one file. The rest of
  the code never sees them.

### Streaming: words as they come

A normal HTTP call waits for the whole answer, then gets it at once. For a tutor answer, that can take many
seconds, and the page would look frozen.

**Streaming** means the server sends the answer in small pieces, as the model writes them, on one connection that
stays open. Google uses **Server-Sent Events (SSE)** for this: a text format where each event is a few lines that
start with `data:`, and an empty line ends the event.

```text
data: {"candidates":[{"content":{"parts":[{"text":"Bonjour"}]}}]}

data: {"candidates":[{"content":{"parts":[{"text":" ! Le passé"}]}}]}

data: {"candidates":[{"content":{"parts":[{"text":" composé..."}]}, "finishReason":"STOP"}]}

```

In TypeScript, a stream of pieces is an **`AsyncIterable<string>`**: something you read with
`for await (const piece of stream) { ... }`. Each turn of the loop waits for the next piece. Functions written
with `async *` (an **async generator**) make such a stream: each `yield` hands one piece to the loop.

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as API (DiscussionService)
    participant P as GeminiProvider.streamText
    participant G as Google Gemini
    B->>API: learner message
    API->>P: streamText({ system, messages, signal })
    P->>G: POST ...:streamGenerateContent?alt=sse
    G-->>P: event "Bonjour"
    P-->>API: yield "Bonjour"
    API-->>B: piece 1
    G-->>P: event " ! Le passé"
    P-->>API: yield " ! Le passé"
    API-->>B: piece 2
    G-->>P: last event, finishReason STOP
    P-->>API: loop ends
    API-->>B: done
```

---

## The files of `src/llm`

```text
apps/api/src/llm/
├── llm.provider.ts             the contract (interface), request types, LlmError
├── llm.factory.ts              picks one provider from the .env settings
├── llm.module.ts               the Nest module that offers the provider to others
├── gemini.provider.ts          the real provider: Google Gemini over HTTP
├── fixture.provider.ts         fake provider: no network (default)
├── disabled.provider.ts        fake provider: everything fails
├── GEMINI_PROVIDER.md          long French explanation of gemini.provider.ts
└── *.spec.ts                   unit tests (one per file, two for Gemini)
```

We read them in the order the app uses them: first the contract, then how the app picks a provider at boot,
then each provider.

---

## `llm.provider.ts` — the contract

[llm.provider.ts](../../apps/api/src/llm/llm.provider.ts) holds no logic. It describes the "plug shape" that
every provider must have. It exports:

| Export              | Kind            | Role                                                        |
| ------------------- | --------------- | ----------------------------------------------------------- |
| `LLM_PROVIDER`      | `Symbol` value  | The name (token) other classes use to ask Nest for the provider |
| `LlmPurpose`        | type            | What a call is for, used in logs and metrics                |
| `StructuredRequest` | interface       | What we send to get JSON back                               |
| `LlmMessage`        | interface       | One turn of a conversation                                  |
| `StreamRequest`     | interface       | What we send to get a streamed text answer                  |
| `LlmProvider`       | interface       | The contract: two methods                                   |
| `LlmFailure`        | type            | The fixed list of failure reasons                           |
| `LlmError`          | class           | The error every provider throws                             |

### The injection token

```ts
// The name other classes use to ask Nest for the LLM provider.
// It is a Symbol, a unique value that still exists at runtime,
// because the LlmProvider interface is erased when the code is compiled.
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
```

In chapter 1 we saw that Nest finds what to inject by the **class** of a constructor parameter. An interface cannot
do that: TypeScript removes interfaces when it compiles to JavaScript, so at runtime `LlmProvider` does not exist.
So we give Nest a real value as a name. A `Symbol` is a value that is unique: no other code can make the same one
by mistake. A class asks for the provider with `@Inject(LLM_PROVIDER)`.

### The purpose

```ts
export type LlmPurpose = `question-batch:${QuestionCategory}` | 'lesson-discussion';
```

This is a **template literal type**. `QuestionCategory` is `'grammar' | 'vocabulary' | 'reading'`, so the allowed
values are exactly `question-batch:grammar`, `question-batch:vocabulary`, `question-batch:reading` and
`lesson-discussion`. A typo does not compile. The purpose shows in the logs and labels the metrics, so you can see
what each call cost.

### The two requests

```ts
export interface StructuredRequest<S extends z.ZodType> {
  purpose: LlmPurpose;
  /** The rules and the role of the model, for example "You are an exam designer". */
  system: string;
  /** The precise request, for example "Write 13 A1 grammar questions". */
  user: string;
  /** Describes the JSON we expect back, and checks the reply against it. */
  schema: S;
}
```

`S` is a **generic**: a type filled in at each call. `S extends z.ZodType` means "S must be a Zod schema". The
schema does two jobs: it tells the model what JSON shape to write, and it checks the reply.

```ts
export interface StreamRequest {
  purpose: LlmPurpose;
  system: string;
  /** The conversation so far, oldest first. The last one is the learner's new message. */
  messages: LlmMessage[];
  /** The longest answer we pay for, in tokens. The model stops there, mid-sentence if it must. */
  maxOutputTokens: number;
  signal: AbortSignal;
}
```

`LlmMessage` is `{ role: 'user' | 'assistant'; text: string }`. The names are ours; each provider translates
them (Gemini calls the model "model").

`signal` is an **`AbortSignal`**: a small object that can say "stop now". The route fires it when the learner
closes the page. The comment explains why it is required, not optional: "a stream nobody can stop keeps spending
tokens for no one".

### The contract

```ts
export interface LlmProvider {
  generateStructured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>>;

  streamText(request: StreamRequest): AsyncIterable<string>;
}
```

- `generateStructured` returns `Promise<z.output<S>>`: "later, an object with the shape of the schema, already
  checked". TypeScript reads the type from the schema you pass, so nobody writes the result type by hand.
- `streamText` returns an `AsyncIterable<string>`: pieces of text, read with `for await`. A failure is thrown
  **from the loop**, maybe after some pieces were already sent. If the caller aborts the signal, the loop ends
  with an `AbortError`, not an `LlmError`: "the caller asked for it, the LLM did not fail".

### `LlmFailure` and `LlmError`

```ts
export type LlmFailure =
  'unreachable' | 'rate_limited' | 'http_error' | 'blocked' | 'incomplete' | 'invalid' | 'disabled';

export class LlmError extends Error {
  constructor(
    message: string,
    /** Whether sending the same request again may succeed. */
    readonly retryable: boolean,
    /** Why it failed, for the metrics. The message says it to a person. */
    readonly reason: LlmFailure,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
```

Every provider failure is an `LlmError` with three things:

| Field       | For whom         | Example                                  |
| ----------- | ---------------- | ---------------------------------------- |
| `message`   | a person reading logs | `Gemini 429: {"error": ...}`        |
| `retryable` | the caller       | `true`: a second try may work            |
| `reason`    | the metrics, the error codes | `rate_limited`               |

`reason` is a fixed list, never free text, because the metrics count failures by it: free text would make a new
metric series for each message. The meaning of each reason:

| Reason         | Meaning                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `unreachable`  | No HTTP answer at all (network, DNS, timeout), or the connection dropped midway |
| `rate_limited` | HTTP 429: too many requests for our key                                    |
| `http_error`   | Any other status outside 2xx                                               |
| `blocked`      | Google's safety filters refused the prompt or stopped the reply            |
| `incomplete`   | The reply was cut short for another reason                                 |
| `invalid`      | The reply is not JSON, or fails the schema                                 |
| `disabled`     | No real LLM behind the provider (fixture questions, `LLM_PROVIDER=disabled`) |

`LlmError` is a **class**, not an interface, so it exists at runtime and callers can test
`error instanceof LlmError`.

---

## `llm.factory.ts` — picking one provider

[llm.factory.ts](../../apps/api/src/llm/llm.factory.ts) exports one function, `createLlmProvider`. It reads three
settings and builds the right provider.

| Setting        | Values                                 | Default              |
| -------------- | -------------------------------------- | -------------------- |
| `LLM_PROVIDER` | `fixture`, `gemini`, `disabled`        | `fixture`            |
| `LLM_API_KEY`  | the Gemini key (required for `gemini`) | none                 |
| `LLM_MODEL`    | a Gemini model id                      | `gemini-3.6-flash`   |

```ts
export function createLlmProvider({
  LLM_PROVIDER = 'fixture',
  LLM_API_KEY,
  LLM_MODEL,
}: LlmEnv): LlmProvider {
  switch (LLM_PROVIDER) {
    case 'fixture':
      showProvider('fixture', 'none');
      return new FixtureProvider();
    case 'gemini': {
      if (!LLM_API_KEY) throw new Error('LLM_PROVIDER=gemini needs LLM_API_KEY. See .env.example.');
      // The braces after "case" give this "model" its own scope inside the switch.
      const model = LLM_MODEL || DEFAULT_GEMINI_MODEL;
      showProvider('gemini', model);
      return new GeminiProvider({ apiKey: LLM_API_KEY, model });
    }
    case 'disabled':
      showProvider('disabled', 'none');
      return new DisabledProvider();
    default:
      throw new Error(
        `LLM_PROVIDER must be "fixture", "gemini" or "disabled", got "${LLM_PROVIDER}". See .env.example.`,
      );
  }
}
```

How it works:

- The `{ ... }` in the parameter list **destructures** the settings object: each key becomes a variable.
  `LLM_PROVIDER = 'fixture'` is a default value, so with no `.env` the API starts with the fixture: no network,
  no cost.
- The return type is `LlmProvider`. The caller does not know which class it got. That is the point.
- **It throws on a bad setting.** The function runs once, when the API starts. A missing key or a typo in
  `LLM_PROVIDER` stops the start with a clear message. Without this, the problem would only appear later, on the
  first restock, while learners use the app.

`showProvider` sets a metric, `ft_llm_provider_info{provider, model} = 1`, so the dashboard shows which provider
runs. It calls `reset()` first, so a second call (in a test) leaves one provider, not two.

[llm.factory.spec.ts](../../apps/api/src/llm/llm.factory.spec.ts) checks each case: the fixture by default, the
disabled provider, Gemini with its key and model, and the errors.

---

## `llm.module.ts` — offering the provider to the app

[llm.module.ts](../../apps/api/src/llm/llm.module.ts) is a small Nest module. It uses a **factory provider**: instead
of giving Nest a class to build, we give it a function to call.

```ts
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLlmProvider({
          LLM_PROVIDER: config.get('LLM_PROVIDER'),
          LLM_API_KEY: config.get('LLM_API_KEY'),
          LLM_MODEL: config.get('LLM_MODEL'),
        }),
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
```

- `provide: LLM_PROVIDER`: the token other classes ask for.
- `inject: [ConfigService]`: what Nest passes to the factory. `ConfigService` reads the `.env` file (chapter 2).
- `useFactory`: Nest calls it **once at startup**. What it returns is the single provider object the whole API
  shares.
- `exports: [LLM_PROVIDER]`: modules that import `LlmModule` can inject it too.

This is why `GeminiProvider` has no `@Injectable()`: Nest never builds it from its class. The factory calls
`new GeminiProvider({ apiKey, model })` itself, after checking the key.

```mermaid
flowchart TD
    ENV[".env file"] --> CS["ConfigService"]
    CS --> UF["useFactory in LlmModule<br/>(runs once at boot)"]
    UF --> CF["createLlmProvider()"]
    CF -->|"bad setting"| STOP["throw: API does not start"]
    CF -->|"ok"| P["one provider object<br/>under the token LLM_PROVIDER"]
    P --> QS["QuestionStockService<br/>@Inject(LLM_PROVIDER)"]
    P --> DS["DiscussionService<br/>@Inject(LLM_PROVIDER)"]
```

[llm.module.spec.ts](../../apps/api/src/llm/llm.module.spec.ts) builds the real module with a fake `ConfigService`:
it checks that the provider named in `LLM_PROVIDER` is built, that the fixture is the default, and that Gemini
without a key fails.

---

## `gemini.provider.ts` — the real provider

[gemini.provider.ts](../../apps/api/src/llm/gemini.provider.ts) is the biggest file. It calls Google's Gemini API
over HTTP. The French document [GEMINI_PROVIDER.md](../../apps/api/src/llm/GEMINI_PROVIDER.md) next to it explains
it line by line, with a history of the changes since PR #69. Here is the tour.

The file has three parts:

1. **At the top**: constants and the `GeminiReply` interface (the part of Google's JSON we read).
2. **The class**: two public methods (`generateStructured`, `streamText`) and three private ones (`send`, `stream`,
   `record`).
3. **At the bottom**: small private helper functions (`requestBody`, `streamBody`, `unreachable`, `isRetryable`,
   `replyText`, `answerText`, `parseReply`, `parseJson`, `sseData`, `eventData`).

### The constants

```ts
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// How long we wait for Gemini before giving up: 90 seconds. "90_000" is just 90000,
// the "_" only makes the number easier to read. A free key waited 73 to 83 s for
// its first word on 2026-11-18, where 2 to 40 s was usual before.
const TIMEOUT_MS = 90_000;
```

- `API` is the base address. Each call adds `/<model>:generateContent` (one answer) or
  `/<model>:streamGenerateContent?alt=sse` (streamed answer).
- `TIMEOUT_MS`: we give up after 90 seconds. The comment gives the real reason for this big number: a free key
  was measured waiting more than 70 seconds.
- `OUTCOMES`, `TOKEN_TYPES`, `PURPOSES`: the lists of metric labels (see "The constructor: metrics start at zero" and "`record`" below).
- `FILTERED`: the finish reasons that mean Google's filters stopped the answer (`SAFETY`, `PROHIBITED_CONTENT`,
  `BLOCKLIST`, `SPII`, `RECITATION`).

### `GeminiReply`: Google's answer, as far as we read it

```ts
interface GeminiReply {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}
```

Every field has a `?` because this JSON comes from outside and we do not trust it. TypeScript then forces the code
to check each field (`?.`, `??`) before using it.

| Field                        | Meaning                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `promptFeedback.blockReason` | Set when Google refused our prompt (safety filters)              |
| `candidates[0]`              | The answer (we ask for one)                                      |
| `finishReason`               | Why the model stopped. `"STOP"` = finished normally              |
| `content.parts`              | The text, maybe cut in several parts. `thought: true` marks the model's reasoning, not the answer |
| `usageMetadata`              | Token counts: what we pay                                        |

Note: for `generateStructured`, the model's text is **itself a JSON string**. So there are two `JSON.parse`: one for
Google's envelope, one for the model's text.

### The constructor: metrics start at zero

```ts
constructor(private readonly options: { apiKey: string; model: string }) {
  for (const purpose of PURPOSES) {
    for (const outcome of OUTCOMES) {
      llmRequests.inc({ provider: 'gemini', model: options.model, purpose, outcome }, 0);
    }
    for (const type of TOKEN_TYPES) {
      llmTokens.inc({ provider: 'gemini', model: options.model, purpose, type }, 0);
    }
  }
}
```

`private readonly options` in the parameter list declares a field and fills it in one step. The class never reads
the `.env` itself, so a test can build it with `new GeminiProvider({ apiKey: 'test', model: 'x' })`.

The loops create every metric series with the value 0. Prometheus (chapter 3) computes rates from the
**difference** between two readings; a counter that appears directly at 1 has no "before", so its first call would
be invisible.

### `generateStructured`: measure, then `send`

```ts
async generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<z.output<S>> {
  const labels = { provider: 'gemini', model: this.options.model, purpose: request.purpose };
  // startTimer starts a clock; calling stop() records the time since then.
  const stop = llmRequestDuration.startTimer(labels);
  try {
    const reply = await this.send(request);
    llmRequests.inc({ ...labels, outcome: 'ok' });
    return reply;
  } catch (error) {
    // send() only throws LlmErrors, each with its reason.
    if (error instanceof LlmError) llmRequests.inc({ ...labels, outcome: error.reason });
    throw error;
  } finally {
    // "finally" runs either way, so failures are timed too.
    stop();
  }
}
```

The public method only **measures**: how long, and how it ended (`ok` or the error's `reason`). Then it throws the
same error again, so metrics never change the behaviour. The work is in `send`.

### `send`: one HTTP call, step by step

```ts
const response = await fetch(`${API}/${model}:generateContent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
  body: JSON.stringify(requestBody(request)),
  signal: AbortSignal.timeout(TIMEOUT_MS),
}).catch(unreachable);
const body = await response.text().catch(unreachable);
if (!response.ok) {
  throw new LlmError(
    `Gemini ${response.status}: ${body}`,
    isRetryable(response.status),
    response.status === 429 ? 'rate_limited' : 'http_error',
  );
}

const reply = parseJson(body, 'response') as GeminiReply;
// Counted before the reply is checked: one that fails the check was still billed.
this.record(request.purpose, reply.usageMetadata, started);
return parseReply(request.schema, replyText(reply));
```

1. **`fetch`** sends the request. The key goes in a **header** (`x-goog-api-key`), not in the URL: URLs often end
   up in logs. `AbortSignal.timeout(TIMEOUT_MS)` cancels the call after 90 s.
2. `fetch` only rejects when there is **no HTTP answer at all** (no network, DNS error, timeout). A 500 or a 429 is
   still an answer. `.catch(unreachable)` turns a rejection into a retryable `LlmError`.
3. The body is read as **text**, not `response.json()`, so an error page can still be put in the message. The
   timeout also covers this step, so it has the same `.catch(unreachable)`.
4. A status outside 200–299 throws. `isRetryable` decides if a second try makes sense.
5. Google's JSON is parsed, tokens are logged and counted (`record`), then the model's text is extracted
   (`replyText`) and checked against the schema (`parseReply`).

```mermaid
flowchart TD
    A["fetch POST :generateContent"] -->|"no answer / timeout"| U["LlmError unreachable<br/>retryable"]
    A --> B["response.text()"]
    B -->|"connection dropped"| U
    B --> C{"response.ok?"}
    C -->|"no"| H["LlmError rate_limited / http_error<br/>retryable if 408, 429, 5xx"]
    C -->|"yes"| D["parseJson(body)"]
    D -->|"not JSON"| I["LlmError invalid, retryable"]
    D --> E["record tokens + time"]
    E --> F["replyText"]
    F -->|"blocked prompt"| BL["LlmError blocked, not retryable"]
    F -->|"finishReason not STOP"| IN["LlmError incomplete, not retryable"]
    F --> G["parseReply: JSON.parse + Zod"]
    G -->|"bad JSON or schema fails"| I
    G --> OK["checked data"]
```

### `requestBody`: what Google receives

```ts
function requestBody({ system, user, schema }: StructuredRequest<z.ZodType>) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(schema),
    },
  };
}
```

`z.toJSONSchema(schema)` turns our Zod schema into a **JSON Schema**, a standard format that describes a JSON
shape. Gemini then writes JSON with exactly those fields, types and array lengths. So the prompt does not need to
describe the format in words.

One limit, from the comment: rules written with Zod's `.refine()` (like "the answer is one of the options")
cannot be turned into JSON Schema. Gemini never sees them. They are checked only later, in `parseReply`.

### Errors: retry or not?

```ts
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
```

408 (timeout), 429 (too many requests) and 5xx (Google's server failed) are temporary. A 400, 401, 403 or 404 fails
the same way twice.

`replyText` checks the reply before using it:

```ts
function replyText(reply: GeminiReply): string {
  // Gemini refused to answer our prompt at all (safety filters).
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false, 'blocked');

  const candidate = reply.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') {
    const reason = candidate ? (candidate.finishReason ?? 'no finish reason') : 'no candidate';
    throw new LlmError(`Gemini stopped early: ${reason}`, false, 'incomplete');
  }
  return answerText(candidate);
}
```

A blocked prompt or a cut reply (`MAX_TOKENS`, `SAFETY`) comes back the same on a retry: not retryable.

`answerText` glues the text parts together and **drops the reasoning parts** (`thought: true`). Those are the
model's "thinking", not the answer, and they would break `JSON.parse`.

`parseReply` does `JSON.parse` then `schema.safeParse`. `safeParse` does not throw: it returns
`{ success: true, data }` or `{ success: false, error }`. A failure becomes a **retryable** `invalid` error: the
model writes something different each time, so the next try may be fine. `z.prettifyError` makes the Zod error
readable in the logs.

`parseJson` is `JSON.parse` that throws an `LlmError` instead of a `SyntaxError`. It is retryable too: a 200 whose
body is not JSON is usually an error page from a proxy on the way.

Summary of all errors:

| Situation                                   | Reason         | Retryable |
| ------------------------------------------- | -------------- | --------- |
| No network, DNS, timeout, dropped connection | `unreachable`  | yes       |
| HTTP 429                                    | `rate_limited` | yes       |
| HTTP 408 or 5xx                             | `http_error`   | yes       |
| Other non-2xx (400, 401, 403, 404...)       | `http_error`   | no        |
| Body or model text is not JSON              | `invalid`      | yes       |
| JSON fails the schema                       | `invalid`      | yes       |
| Prompt blocked                              | `blocked`      | no        |
| No candidate, or stopped before `STOP`      | `incomplete`   | no        |
| Streamed: stopped by a filter               | `blocked`      | no        |
| Streamed: other early stop, no `STOP`, empty answer | `incomplete` | no   |

The provider decides `retryable` because it knows Google best. The caller only reads the flag (see
`QuestionStockService` in chapter 7).

### `record`: logs and token counts

```ts
this.logger.log(
  `${purpose} on ${model}: ${usage?.promptTokenCount ?? '?'} in, ` +
    `${usage?.candidatesTokenCount ?? '?'} out, ${thinking} thinking, ` +
    `${usage?.totalTokenCount ?? '?'} total tokens, ` +
    `${Date.now() - started} ms`,
);
```

One log line per call, for example:

```text
[GeminiProvider] question-batch:grammar on gemini-3.6-flash: 5200 in, 1800 out, 0 thinking, 7000 total tokens, 8432 ms
```

Then it adds the token numbers to the `llmTokens` metric. A number Google left out is skipped, not counted as 0.
`record` is shared by `send` and `stream`, so both log and count the same way.

### `streamText` and `stream`: the tutor's answer

`streamText` has the same "measure, then do the work" shape as `generateStructured`, but as an async generator:

```ts
async *streamText(request: StreamRequest): AsyncIterable<string> {
  const labels = { provider: 'gemini', model: this.options.model, purpose: request.purpose };
  const stop = llmRequestDuration.startTimer(labels);
  try {
    yield* this.stream(request);
    llmRequests.inc({ ...labels, outcome: 'ok' });
  } catch (error) {
    if (error instanceof LlmError) llmRequests.inc({ ...labels, outcome: error.reason });
    throw error;
  } finally {
    stop();
  }
}
```

`yield*` passes on every piece that `stream()` yields. The call counts as `ok` only once the whole answer went
through. Two endings count no outcome, only the time: the learner leaving (an `AbortError`), and a caller that
stops reading early.

The body of `stream`:

```ts
// Two reasons to cancel, whichever comes first: the learner left (request.signal),
// or the whole answer took longer than TIMEOUT_MS.
const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
// What a failed read becomes. If the learner left, the error stays as it is: it is
// not Gemini's failure. Anything else (network, timeout, a cut connection) is unreachable.
const lost = (error: Error): never => {
  if (request.signal.aborted) throw error;
  return unreachable(error);
};
```

- `AbortSignal.any` makes one signal from two: the learner's signal and the 90 s timeout. Note the timeout covers
  the **whole** answer, not only the first byte.
- `lost` decides what a failed read becomes: the learner's own abort passes unchanged, anything else is
  `unreachable`.

Then it posts to `:streamGenerateContent?alt=sse` with `streamBody(request)`, and reads events:

```ts
for await (const data of sseData(response.body, lost)) {
  const reply = parseJson(data, 'response') as GeminiReply;
  usage = reply.usageMetadata ?? usage;
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false, 'blocked');

  const candidate = reply.candidates?.[0];
  const text = answerText(candidate);
  if (text) {
    wrote = true;
    yield text;
  }
  const reason = candidate?.finishReason;
  if (reason && reason !== 'STOP') {
    const failure = FILTERED.has(reason) ? 'blocked' : 'incomplete';
    throw new LlmError(`Gemini stopped early: ${reason}`, false, failure);
  }
  if (reason === 'STOP') finished = true;
}
```

Each event is a small `GeminiReply`. Its text is handed on **at once** (`yield`). Only the last event has a
`finishReason`. After the loop: no `STOP` means Google closed early (`incomplete`), and no text at all means an
empty answer (`incomplete`). A `finally` calls `record` in every case, even when the learner leaves, because the
tokens used so far were billed.

`streamBody` differs from `requestBody`:

```ts
function streamBody({ system, messages, maxOutputTokens }: StreamRequest) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(({ role, text }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    })),
    generationConfig: { maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
}
```

- The whole conversation is sent, with `assistant` renamed `model` (Google's word).
- `maxOutputTokens` caps the cost.
- `thinkingBudget: 0` turns off the model's "thinking". The comment explains why: thinking counts against
  `maxOutputTokens` (250 to 660 tokens were measured before answers of 66 to 120), it could cut the answer, and it
  is billed too. A short tutor answer does not need it.
- No JSON schema: the answer is free text.

### `sseData` and `eventData`: reading the event stream

The body arrives in network **packets**, and a packet is not an event: one packet can hold an event and a half.
So `sseData` keeps a `buffer` and only lets complete events out:

```ts
const reader = body.pipeThrough(new TextDecoderStream()).getReader();
let buffer = '';
try {
  for (;;) {
    const { done, value } = await reader.read().catch(lost);
    if (done) return;
    buffer = (buffer + value).replace(/\r\n/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const data = eventData(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (data !== undefined) yield data;
      end = buffer.indexOf('\n\n');
    }
  }
} finally {
  // cancel() rejects on a body that already failed; there is nothing left to close then.
  await reader.cancel().catch(() => undefined);
}
```

- `TextDecoderStream` turns bytes into text, and keeps a character cut between two packets (`é` is two bytes in
  UTF-8) until its second byte comes.
- `\r\n` becomes `\n`, because SSE allows both line endings.
- An event ends with an empty line (`\n\n`). Text after the last one waits for the next packet; if the body ends,
  it is dropped (the SSE standard says an unfinished event does not count).
- `finally` cancels the body when the reader stops early, so the connection to Google closes.

`eventData` takes the `data:` lines of one event, removes `data:` and one optional space, and joins them with
`\n`. An event with no data (a comment line `: ...` that keeps the connection alive) gives `undefined` and is
skipped.

### The Gemini tests

- [gemini.provider.spec.ts](../../apps/api/src/llm/gemini.provider.spec.ts) mocks `fetch` and checks
  `generateStructured`: the key is in a header and never in the URL, the JSON schema is sent, the 90 s timeout,
  joining parts without thoughts, logs, which errors are retryable, and the metrics.
- [gemini.provider.stream.spec.ts](../../apps/api/src/llm/gemini.provider.stream.spec.ts) checks `streamText`:
  the SSE endpoint, events cut across packets (even inside a character), comments skipped, every early stop, the
  learner leaving (an `AbortError`, no outcome counted, body cancelled), and the metrics.

---

## `fixture.provider.ts` — fake answers, for tests and development

[fixture.provider.ts](../../apps/api/src/llm/fixture.provider.ts) is the **default** provider. It never touches the
network. Why does it exist?

- **No key, no cost.** A new developer can run the whole app without a Google account.
- **Tests and CI.** The `.env.example` file says "CI only runs fixture". Tests must not depend on Google being up,
  or spend money.
- **Error paths on demand.** Special words make it fail on purpose, so the e2e tests (and the project defence) can
  show each error without a network.

### It writes no questions

```ts
async generateStructured(): Promise<never> {
  throw new LlmError('LLM_PROVIDER=fixture writes no questions', false, 'disabled');
}
```

This is a deliberate choice, explained in the class comment: "It writes no questions, because a canned one in the
bank is served to learners as real." So a restock with the fixture always fails, like an LLM outage, and placement
falls back to questions the learner saw longest ago (chapter 7).

- `Promise<never>`: the promise never gets a value, it is only rejected. `never` fits any type, so this still
  follows the contract. The method also takes no parameter: a method that uses fewer parameters still fits.
- `retryable: false`: asking again would fail the same way.
- `reason: 'disabled'`: the restock alert leaves these failures out; on a stack without a key they are expected.

### It does answer the tutor

```ts
export const FIXTURE_ANSWER = [
  'This is the fixture tutor. ',
  'It gives the same answer to every question. ',
  'Set LLM_PROVIDER=gemini for a real one.',
];

export const FIXTURE_FAILURES = {
  /** Sends part of the answer, then the connection drops. */
  midstream: '#fail-midstream',
  /** No answer comes in time. */
  timeout: '#timeout',
  /** The prompt is refused before any text. */
  blocked: '#blocked',
} as const;
```

A fixed tutor answer is harmless: "it is never stored and says what it is".

```ts
async *streamText({ messages, signal }: StreamRequest): AsyncIterable<string> {
  // "?." because the list could be empty; "?? ''" then gives a text with no word in it.
  const last = messages.at(-1)?.text ?? '';
  if (last.includes(FIXTURE_FAILURES.blocked)) {
    throw new LlmError('Fixture blocked the prompt', false, 'blocked');
  }
  if (last.includes(FIXTURE_FAILURES.timeout)) {
    throw new LlmError('Fixture timed out', true, 'unreachable');
  }
  for (const [index, piece] of FIXTURE_ANSWER.entries()) {
    // Two pieces out, then the connection "drops": the caller has already sent part of the answer.
    if (index === 2 && last.includes(FIXTURE_FAILURES.midstream)) {
      throw new LlmError('Fixture dropped the connection midway', true, 'unreachable');
    }
    await sleep(this.delayMs, undefined, { signal });
    yield piece;
  }
}
```

- It reads **only the last message**, so an old failure word in the history does not fail the new answer.
- `sleep` (from `node:timers/promises`) waits `delayMs` (50 ms by default) before each piece, so the answer arrives
  over time like a real one, and a test has time to cancel it midway.
- `sleep` gets the `signal`: when the route cancels, the pause rejects with an `AbortError` at once, like a real
  call whose connection is closed.

| Learner's last message contains | What happens                                      |
| ------------------------------- | ------------------------------------------------- |
| `#blocked`                      | fails before any text, reason `blocked`           |
| `#timeout`                      | fails before any text, reason `unreachable`       |
| `#fail-midstream`               | sends 2 pieces, then fails with `unreachable`     |
| anything else                   | sends the 3 pieces of `FIXTURE_ANSWER`            |

[fixture.provider.spec.ts](../../apps/api/src/llm/fixture.provider.spec.ts) checks each row of this table, the
abort, and that `generateStructured` always fails as not retryable.

---

## `disabled.provider.ts` — no LLM at all

[disabled.provider.ts](../../apps/api/src/llm/disabled.provider.ts) is for a stack that must run **no** LLM, not
even the fixture's canned tutor.

```ts
export class DisabledProvider implements LlmProvider {
  async generateStructured(): Promise<never> {
    throw disabled();
  }

  // A generator that fails before its first piece: the caller's "for await" throws.
  // eslint-disable-next-line require-yield
  async *streamText(): AsyncIterable<string> {
    throw disabled();
  }
}

/** Not retryable: a second try meets the same setting. */
const disabled = () => new LlmError('LLM_PROVIDER=disabled', false, 'disabled');
```

Every call fails at once with reason `disabled`. The lesson discussion then ends with the error code
`llm.disabled`, and a restock counts as `llm_disabled`, which the alert leaves out. `streamText` is an `async *`
generator with no `yield`, so ESLint's `require-yield` rule is turned off for that line.

[disabled.provider.spec.ts](../../apps/api/src/llm/disabled.provider.spec.ts) checks both methods fail.

The three providers side by side:

| Provider           | `generateStructured` (questions) | `streamText` (tutor)               | Network |
| ------------------ | -------------------------------- | ---------------------------------- | ------- |
| `GeminiProvider`   | real questions, checked by Zod   | real answer, piece by piece        | yes     |
| `FixtureProvider`  | always fails (`disabled`)        | fixed answer, or a failure on demand | no    |
| `DisabledProvider` | always fails (`disabled`)        | always fails (`disabled`)          | no      |

---

## Who uses the LLM

A search for `LLM_PROVIDER` outside `src/llm` finds exactly two users, each with one method:

| User | Module | Method | Purpose |
| ---- | ------ | ------ | ------- |
| [QuestionStockService](../../apps/api/src/question-generation/question-stock.service.ts) | `QuestionGenerationModule` imports `LlmModule` | `generateStructured` | `question-batch:<category>` |
| [DiscussionService](../../apps/api/src/lessons/discussion.service.ts) | `LessonsModule` imports `LlmModule` | `streamText` | `lesson-discussion` |

Both ask for it the same way:

```ts
@Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
```

The tutor call, from `DiscussionService`:

```ts
answer(system: string, body: LessonDiscussionInput, signal: AbortSignal): AsyncIterable<string> {
  return this.llm.streamText({
    purpose: 'lesson-discussion',
    system,
    messages: [...body.history, { role: 'user', text: body.message }],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    signal,
  });
}
```

[discussion.controller.ts](../../apps/api/src/lessons/discussion.controller.ts) catches an `LlmError` and turns its
`reason` into an error code for the browser. The question stock reads `retryable` to decide on a second try. Both
are explained in their own chapters: [07-courses-placement.md](07-courses-placement.md) and
[08-lessons.md](08-lessons.md).

---

## Key ideas to remember

- The rest of the API only knows the `LlmProvider` interface. It asks Nest for it with the token `LLM_PROVIDER`
  (a `Symbol`, because interfaces vanish at runtime).
- `createLlmProvider` picks the provider **once, at boot**, from `LLM_PROVIDER`, `LLM_API_KEY` and `LLM_MODEL`.
  A bad setting stops the start. The default is `fixture`.
- `generateStructured` returns JSON already checked by a Zod schema. The same schema is sent to Gemini as a JSON
  Schema, but `.refine()` rules are only checked on our side.
- `streamText` returns an `AsyncIterable<string>`: the answer piece by piece, read from Google's SSE events. The
  learner's `AbortSignal` can stop it.
- Every failure is an `LlmError` with `retryable` (try again?) and `reason` (a fixed word for metrics and error
  codes).
- Gemini waits at most 90 seconds; the key is in a header, never in the URL; tokens and time are logged and
  counted on every call.
- The fixture writes no questions (so the bank stays clean) but answers the tutor with a fixed text, and fails on
  demand with `#blocked`, `#timeout`, `#fail-midstream`.
- `DisabledProvider` makes every call fail, for a stack with no LLM at all.

---

Previous: [Chapter 5 — Auth and users](05-auth-and-users.md) · Next: [Chapter 7 — Courses, the placement test and question generation](07-courses-placement.md) · [Back to index](README.md)
