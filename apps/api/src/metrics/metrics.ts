import {
  CLIENT_EVENTS,
  type ClientEventName,
  LEARNABLE_LANGUAGES,
  LEVELS,
  QUESTION_CATEGORIES,
  SERVER_EVENTS,
} from '@ft/shared';
import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';

// Module level, not an injected service: the services that record are built by
// hand in their specs, and GeminiProvider is not built by Nest at all.
// Our own registry, so nothing a dependency registers leaks into the scrape.
// Labels are always bounded: never a user id, an email or a raw URL.
export const registry = new Registry();

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP requests by method, route template and final status code',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'HTTP requests being served',
  registers: [registry],
});

export const wsConnections = new Gauge({
  name: 'ft_ws_connections',
  help: 'Open WebSocket connections',
  registers: [registry],
});

export const WS_OUTCOMES = ['ok', 'invalid', 'rate_limited'] as const;

export const wsEvents = new Counter({
  name: 'ft_ws_events_total',
  help: 'WebSocket events by direction (in, out), event and outcome',
  labelNames: ['direction', 'event', 'outcome'] as const,
  registers: [registry],
});

export const llmRequests = new Counter({
  name: 'ft_llm_requests_total',
  help: 'LLM calls by outcome',
  labelNames: ['provider', 'model', 'purpose', 'outcome'] as const,
  registers: [registry],
});

export const llmRequestDuration = new Histogram({
  name: 'ft_llm_request_duration_seconds',
  help: 'LLM call duration, failures included',
  labelNames: ['provider', 'model', 'purpose'] as const,
  // Up to the 60 s timeout of gemini.provider.ts.
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60],
  registers: [registry],
});

export const llmTokens = new Counter({
  name: 'ft_llm_tokens_total',
  help: 'LLM tokens as the provider reports them, by type (prompt, output, total)',
  labelNames: ['provider', 'model', 'purpose', 'type'] as const,
  registers: [registry],
});

export const llmProviderInfo = new Gauge({
  name: 'ft_llm_provider_info',
  help: 'The LLM provider and model this API runs with (always 1)',
  labelNames: ['provider', 'model'] as const,
  registers: [registry],
});

export const RESTOCK_STATUSES = ['busy', 'cooling', 'filled', 'empty', 'failed'] as const;
export type RestockStatus = (typeof RESTOCK_STATUSES)[number];

export const questionRestocks = new Counter({
  name: 'ft_question_restocks_total',
  help: 'Question bank restocks by status (busy, cooling, filled, empty, failed)',
  labelNames: ['lang', 'level', 'category', 'status'] as const,
  registers: [registry],
});

export const RESTOCK_FAILURE_REASONS = ['llm', 'llm_disabled', 'other'] as const;
export type RestockFailureReason = (typeof RESTOCK_FAILURE_REASONS)[number];

export const questionRestockFailures = new Counter({
  name: 'ft_question_restock_failures_total',
  help: 'Failed restocks by reason (llm, llm_disabled, other)',
  labelNames: ['category', 'reason'] as const,
  registers: [registry],
});

export const questionRestockInserted = new Counter({
  name: 'ft_question_restock_inserted_total',
  help: 'Generated questions added to the bank',
  labelNames: ['lang', 'level', 'category'] as const,
  registers: [registry],
});

export const questionRestockDuration = new Histogram({
  name: 'ft_question_restock_duration_seconds',
  help: 'Restock duration: LLM, dedupe and insert, retry included',
  labelNames: ['category'] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60, 120],
  registers: [registry],
});

export const DRAW_SOURCES = ['written', 'generated', 'seen_fallback'] as const;
export type DrawSource = (typeof DRAW_SOURCES)[number];

export const placementDraws = new Counter({
  name: 'ft_placement_draws_total',
  help: 'Placement questions served by source (written, generated, seen_fallback)',
  labelNames: ['lang', 'level', 'category', 'source'] as const,
  registers: [registry],
});

export const placementPoolExhausted = new Counter({
  name: 'ft_placement_pool_exhausted_total',
  help: 'Placement draws that found nothing to serve',
  labelNames: ['lang', 'level'] as const,
  registers: [registry],
});

export const EXAM_EVENTS = ['started', 'completed', 'quit'] as const;

export const placementExams = new Counter({
  name: 'ft_placement_exams_total',
  help: 'Placement exams by event (started, completed, quit)',
  labelNames: ['lang', 'event'] as const,
  registers: [registry],
});

export const appInfo = new Gauge({
  name: 'ft_app_info',
  help: 'The running API version (always 1)',
  labelNames: ['version'] as const,
  registers: [registry],
});

// increase() misses a counter's first increment when the series is born at 1,
// so every label set an alert or a panel reads exists at 0 from the start.
for (const lang of LEARNABLE_LANGUAGES) {
  for (const event of EXAM_EVENTS) placementExams.inc({ lang, event }, 0);
  for (const level of LEVELS) {
    placementPoolExhausted.inc({ lang, level }, 0);
    for (const category of QUESTION_CATEGORIES) {
      questionRestockInserted.inc({ lang, level, category }, 0);
      for (const status of RESTOCK_STATUSES)
        questionRestocks.inc({ lang, level, category, status }, 0);
      for (const source of DRAW_SOURCES) placementDraws.inc({ lang, level, category, source }, 0);
    }
  }
}
for (const category of QUESTION_CATEGORIES) {
  for (const reason of RESTOCK_FAILURE_REASONS)
    questionRestockFailures.inc({ category, reason }, 0);
}
for (const event of Object.values(SERVER_EVENTS)) {
  wsEvents.inc({ direction: 'out', event, outcome: 'ok' }, 0);
}
// A name the gateway does not know is counted as `unknown`: the label stays bounded.
for (const event of [...Object.values<ClientEventName>(CLIENT_EVENTS), 'unknown']) {
  for (const outcome of WS_OUTCOMES) wsEvents.inc({ direction: 'in', event, outcome }, 0);
}
// The auth panels of the API dashboard, routes as routeOf() names them. Not
// every route: each set is 14 series.
export const AUTH_SERIES = [
  ['/api/auth/signup', [201]],
  ['/api/auth/login', [200, 202, 401, 429]],
  ['/api/auth/2fa/verify', [401]],
] as const;
for (const [route, statuses] of AUTH_SERIES) {
  for (const status_code of statuses)
    httpRequestDuration.zero({ method: 'POST', route, status_code });
}

const ACTIVE_WINDOW_MS = 5 * 60_000;

// In memory, so per process: enough for the single API replica, like the
// restock maps (question-stock.service.ts). Oldest first: a touch moves the
// user to the end, so pruning stops at the first recent entry.
const lastSeen = new Map<string, number>();

/** Called by AuthGuard for every signed-in request. */
export function touchActiveUser(userId: string, now = Date.now()): void {
  lastSeen.delete(userId);
  lastSeen.set(userId, now);
  prune(now);
}

/** Distinct signed-in users seen in the last 5 minutes. */
export function countActiveUsers(now = Date.now()): number {
  prune(now);
  return lastSeen.size;
}

function prune(now: number): void {
  for (const [userId, seen] of lastSeen) {
    if (now - seen < ACTIVE_WINDOW_MS) return;
    lastSeen.delete(userId);
  }
}
