import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { SocketExceptionFilter } from './socket-exception.filter';

/** What Nest hands the filter of a gateway handler: socket, payload, ack, event name. */
function hostWith(ack?: (answer: unknown) => void) {
  const emit = vi.fn();
  const host = {
    getArgs: () => [{ emit }, { userId: 'u2' }, ack, 'dm:send'],
  } as unknown as ArgumentsHost;
  return { host, emit };
}

describe('SocketExceptionFilter', () => {
  let error: MockInstance;
  beforeEach(() => {
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    error.mockRestore();
  });

  it("answers the ack with a service's code, and logs nothing", () => {
    const ack = vi.fn();
    const { host, emit } = hostWith(ack);

    new SocketExceptionFilter().catch(new ForbiddenException('message.notFriends'), host);

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'message.notFriends' });
    expect(emit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('sends app:error to the socket when the event came without an ack', () => {
    const { host, emit } = hostWith();

    new SocketExceptionFilter().catch(new BadRequestException('request.invalid'), host);

    expect(emit).toHaveBeenCalledExactlyOnceWith('app:error', { code: 'request.invalid' });
  });

  it.each([
    ['a crash', new Error('P1001')],
    ['an HttpException holding a sentence', new HttpException('Internal server error', 500)],
  ])('answers server.unexpected for %s, and logs it', (_, exception) => {
    const ack = vi.fn();

    new SocketExceptionFilter().catch(exception, hostWith(ack).host);

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'server.unexpected' });
    expect(error).toHaveBeenCalledWith(exception);
  });
});
