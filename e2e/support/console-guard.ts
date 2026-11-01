import type { ConsoleMessage, Page, Request } from '@playwright/test';

/**
 * The console gate. A browser console that is noisy on a production build is a
 * subject rejection criterion, so this is deliberately strict: any console
 * error, any console warning, any uncaught exception and any failed request
 * fails the route.
 */

export type ViolationKind = 'console.error' | 'console.warning' | 'pageerror' | 'requestfailed';

export interface ConsoleViolation {
  kind: ViolationKind;
  text: string;
  where?: string;
}

/**
 * Every entry added here is a permanent hole in a rejection-criterion gate, so
 * it needs a comment naming the upstream bug and the condition for removing it
 * again. Prefer fixing the page.
 */
const ALLOWED_MESSAGES: RegExp[] = [
  // Firefox announcing its own fingerprinting protection when a script reads
  // screen.availWidth. Only Grafana's bundle does (/grafana/login); our pages
  // never read it. Remove if Firefox stops logging the notice as a warning.
  /^\[JavaScript Warning: "Fingerprinting Protection is altering screen\.availWidth/,
  // Firefox on a runner with no GPU, when Grafana's bundle probes for WebGL
  // (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS). The machine, not the page: a
  // desktop Firefox creates the context. Remove if the CI runner gets a GPU.
  /^\[JavaScript Warning: "Failed to create WebGL context: WebGL creation failed:/,
  // The same probe on a machine with a GPU: the context is created, and
  // Grafana's bundle then reads the GPU name through WEBGL_debug_renderer_info,
  // which Firefox deprecates in favour of RENDERER. Our pages never use WebGL.
  // Remove once Grafana stops reading the extension or Firefox drops the warning.
  /^\[JavaScript Warning: "WEBGL_debug_renderer_info is deprecated in Firefox/,
];

/**
 * A navigation cancels in-flight prefetches, and every engine reports each one
 * as a failed request, in its own words: Chromium `net::ERR_ABORTED`, Firefox
 * `NS_BINDING_ABORTED`, WebKit `cancelled` (or `Load request cancelled`). That
 * is the browser working correctly, not the app breaking.
 */
const IGNORED_REQUEST_FAILURES =
  /^(net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled)$/;

/**
 * Every entry in ALLOWED_MESSAGES is justified by Grafana's bundle, so the
 * allowance holds on Grafana's pages only. The same warning on one of ours
 * still fails the gate.
 */
function isAllowed(text: string, page: Page): boolean {
  return (
    new URL(page.url()).pathname.startsWith('/grafana/') &&
    ALLOWED_MESSAGES.some((pattern) => pattern.test(text))
  );
}

function describeLocation(message: ConsoleMessage): string | undefined {
  const location = message.location();
  if (!location.url) {
    return undefined;
  }
  return `${location.url}:${location.lineNumber}:${location.columnNumber}`;
}

/** What settle() waits on: the requests still open, and when the last one moved. */
interface RequestTracker {
  inFlight: Set<Request>;
  lastActivity: number;
}

const trackers = new WeakMap<Page, RequestTracker>();

function trackRequests(page: Page): void {
  if (trackers.has(page)) {
    return;
  }
  const tracker: RequestTracker = { inFlight: new Set(), lastActivity: Date.now() };
  const done = (request: Request) => {
    tracker.inFlight.delete(request);
    tracker.lastActivity = Date.now();
  };
  page.on('request', (request) => {
    tracker.inFlight.add(request);
    tracker.lastActivity = Date.now();
  });
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  trackers.set(page, tracker);
}

/**
 * Attach before the first navigation: listeners registered after `goto` miss
 * everything the page logged while loading.
 */
export function watchConsole(page: Page): ConsoleViolation[] {
  const violations: ConsoleViolation[] = [];
  trackRequests(page);

  page.on('console', (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') {
      return;
    }

    const text = message.text();
    if (isAllowed(text, page)) {
      return;
    }

    violations.push({
      kind: type === 'error' ? 'console.error' : 'console.warning',
      text,
      where: describeLocation(message),
    });
  });

  page.on('pageerror', (error: Error) => {
    if (isAllowed(error.message, page)) {
      return;
    }
    violations.push({
      kind: 'pageerror',
      text: `${error.name}: ${error.message}`,
      where: error.stack?.split('\n')[1]?.trim(),
    });
  });

  page.on('requestfailed', (request: Request) => {
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (IGNORED_REQUEST_FAILURES.test(reason) || isAllowed(reason, page)) {
      return;
    }
    violations.push({
      kind: 'requestfailed',
      text: `${request.method()} ${request.url()} failed: ${reason}`,
    });
  });

  return violations;
}

/** Readable failure output: the raw array prints as [object Object] in CI logs. */
export function formatViolations(violations: ConsoleViolation[]): string {
  return violations
    .map((violation, index) => {
      const suffix = violation.where ? `\n      at ${violation.where}` : '';
      return `  ${index + 1}. [${violation.kind}] ${violation.text}${suffix}`;
    })
    .join('\n');
}

/**
 * Chromium logs every non-2xx HTTP response as a console.error reading
 * "Failed to load resource: the server responded with a status of ...". On a
 * route whose EXPECTED status is an error code (the 404 page), the main
 * document itself produces one of these, so a gate that counts it can never
 * pass. This predicate matches exactly that one line: the expected status, at
 * console.error level, attributed to the document URL. A failing stylesheet,
 * image or fetch on the same page still fails the gate.
 */
export function isExpectedDocumentFailure(
  violation: ConsoleViolation,
  documentUrl: string,
  expectedStatus: number,
): boolean {
  if (expectedStatus < 400 || violation.kind !== 'console.error') {
    return false;
  }
  const prefix = `Failed to load resource: the server responded with a status of ${expectedStatus} `;
  return violation.text.startsWith(prefix) && (violation.where?.startsWith(documentUrl) ?? false);
}

/**
 * Waits for the page to stop talking. Console messages arrive asynchronously,
 * so asserting straight after `goto` reads an empty array and passes a page
 * that throws half a second later.
 *
 * The gate needs the point at which nothing else will be logged, which is what
 * `networkidle` means. Each engine misses it in its own way, so this takes
 * whichever of two counts gets there first:
 * - the engine's own `networkidle`. Firefox sometimes never reports it, on a
 *   page whose every request has finished (/api/docs, a few loads in ten with
 *   four workers);
 * - the load event, then QUIET_MS with no request open, counted from the
 *   request events. Chromium sometimes never reports a Next.js `_rsc` fetch as
 *   finished or failed, so this count alone can wait forever there.
 */
const QUIET_MS = 500;

/**
 * Well inside the test timeout, so a page that never settles fails here with
 * the requests still open rather than with a bare "test timeout".
 */
const SETTLE_TIMEOUT_MS = 20_000;

export async function settle(page: Page): Promise<void> {
  const tracker = trackers.get(page);
  if (!tracker) {
    throw new Error('settle() counts requests from watchConsole(page): call that first');
  }
  let settled = false;
  const quiet = (async () => {
    await page.waitForLoadState('load');
    while (
      !settled &&
      (tracker.inFlight.size > 0 || Date.now() - tracker.lastActivity < QUIET_MS)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const open = [...tracker.inFlight].map((request) => request.url());
      reject(
        new Error(
          `settle(): ${page.url()} not settled after ${SETTLE_TIMEOUT_MS} ms; ` +
            `requests still open: ${open.length > 0 ? open.join(', ') : 'none'}`,
        ),
      );
    }, SETTLE_TIMEOUT_MS);
  });
  try {
    await Promise.race([page.waitForLoadState('networkidle'), quiet, timeout]);
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
