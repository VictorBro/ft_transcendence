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
 * Deliberately empty. Every entry added here is a permanent hole in a
 * rejection-criterion gate, so it needs a comment naming the upstream bug and
 * the condition for removing it again. Prefer fixing the page.
 */
const ALLOWED_MESSAGES: RegExp[] = [];

/**
 * A navigation cancels in-flight prefetches, and Chromium reports each one as a
 * failed request. That is the browser working correctly, not the app breaking.
 */
const IGNORED_REQUEST_FAILURES = /net::ERR_ABORTED/;

function isAllowed(text: string): boolean {
  return ALLOWED_MESSAGES.some((pattern) => pattern.test(text));
}

function describeLocation(message: ConsoleMessage): string | undefined {
  const location = message.location();
  if (!location.url) {
    return undefined;
  }
  return `${location.url}:${location.lineNumber}:${location.columnNumber}`;
}

/**
 * Attach before the first navigation: listeners registered after `goto` miss
 * everything the page logged while loading.
 */
export function watchConsole(page: Page): ConsoleViolation[] {
  const violations: ConsoleViolation[] = [];

  page.on('console', (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') {
      return;
    }

    const text = message.text();
    if (isAllowed(text)) {
      return;
    }

    violations.push({
      kind: type === 'error' ? 'console.error' : 'console.warning',
      text,
      where: describeLocation(message),
    });
  });

  page.on('pageerror', (error: Error) => {
    if (isAllowed(error.message)) {
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
    if (IGNORED_REQUEST_FAILURES.test(reason) || isAllowed(reason)) {
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
 * `networkidle` is discouraged for general waiting and is exactly right here:
 * the gate needs the point at which nothing else will be logged.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
