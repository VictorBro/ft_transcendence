import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { isErrorCode, type ErrorCode } from '@ft/shared';

import { refuse, type Ack } from './socket.gateway';
import type { AppSocket } from './sockets.service';

/**
 * ErrorCodeFilter for a gateway's handlers: global filters never reach them,
 * and Nest's own would answer an `exception` event nobody listens to. A
 * service's coded HttpException keeps its code; anything else is a bug, logged
 * and answered `server.unexpected`. Declared on each gateway with @UseFilters.
 */
// No argument: catches every exception, not only one class of them.
@Catch()
export class SocketExceptionFilter implements ExceptionFilter {
  // Nest's own name for its handler, so these lines read like the ones it logs.
  private readonly logger = new Logger('WsExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    // What Nest hands a handler: the socket, the payload, the ack, the event name.
    const [socket, , ack] = host.getArgs<[AppSocket, unknown, Ack | undefined]>();
    let code: ErrorCode = 'server.unexpected';
    if (exception instanceof HttpException && isErrorCode(exception.message)) {
      code = exception.message;
    } else {
      this.logger.error(exception);
    }
    refuse(socket, typeof ack === 'function' ? ack : undefined, code);
  }
}
