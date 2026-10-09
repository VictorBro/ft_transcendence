import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { type ErrorCode, isErrorCode } from '@ft/shared';

/**
 * The last guard on the error contract: a reply whose `message` is not an
 * ERROR_CODES entry leaves with one instead. The browser's readCode reads
 * `message` and translates it, so a sentence there reaches the learner as the
 * generic "Something went wrong".
 *
 * CodeValidationPipe and our own `throw new …Exception('code')` already send
 * codes. This catches what never passes through our code:
 * - Express rejecting a body before Nest sees it: not JSON, or over 100 kB
 * - an unknown route: Nest's "Cannot GET …"
 * - an unhandled error: Nest's "Internal server error"
 *
 * Registered globally in app.setup.ts. A filter declared on a controller or a
 * route (AvatarTooLargeFilter) runs before this one, so it keeps its own reply.
 */
// No argument: catches every exception, not only one class of them.
@Catch()
export class ErrorCodeFilter extends BaseExceptionFilter {
  // Nest's own name for its handler, so these lines read like the ones it logs.
  private readonly logger = new Logger('ExceptionsHandler');

  override catch(exception: unknown, host: ArgumentsHost): void {
    // Almost every error lands here: already coded, so Nest replies as usual.
    if (exception instanceof HttpException && isCoded(messageOf(exception.getResponse()))) {
      super.catch(exception, host);
      return;
    }

    const status = statusOf(exception);
    // A 500 is a bug: keep the stack in the log, as Nest's own handler does.
    // A 4xx is the caller's mistake and needs no log.
    if (status >= 500) {
      this.logger.error(exception);
    }
    // Same status, coded message: the reply keeps Nest's { statusCode, message } shape.
    super.catch(new HttpException(fallbackCode(status), status), host);
  }
}

/**
 * The `message` of an HttpException's reply. Its response is either the string
 * passed to the constructor, or an object built by Nest (or passed by us) that
 * holds `message` among other fields.
 */
function messageOf(response: string | object): unknown {
  return typeof response === 'string' ? response : (response as { message?: unknown }).message;
}

/**
 * Whether the browser can translate this message: one code, or a non-empty
 * array of codes (what CodeValidationPipe sends for a Zod failure). An array
 * with a single sentence in it fails, since readCode may pick that one.
 */
function isCoded(message: unknown): boolean {
  if (typeof message === 'string') {
    return isErrorCode(message);
  }
  return (
    Array.isArray(message) &&
    message.length > 0 &&
    message.every((code) => typeof code === 'string' && isErrorCode(code))
  );
}

/**
 * The HTTP status to answer with, in this order:
 * - an HttpException knows its own
 * - an `http-errors` error, which body-parser throws for an oversized body,
 *   carries it as `statusCode` (413) without being an HttpException
 * - anything else is a crash: 500
 */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  const status = (exception as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * The code that replaces a sentence, chosen by status.
 * - 400: Nest turns a body that is not JSON into a BadRequestException
 *   carrying the parser's English error.
 * - 413: the body is over the parser's limit.
 * - Anything else (404, 500…): `server.unexpected`, whose translation shows
 *   the status, which the browser reads from the reply itself.
 */
function fallbackCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'request.invalid';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'request.tooLarge';
    default:
      return 'server.unexpected';
  }
}
