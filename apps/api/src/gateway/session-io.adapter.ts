import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { RequestHandler } from 'express';
import type { Server, ServerOptions } from 'socket.io';

/**
 * engine.io answers /ws on the http server before Express sees the request, so
 * the session middleware Express runs is handed to it as well: same cookie,
 * same store, nothing parsed by hand.
 */
export class SessionIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly session: RequestHandler,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.engine.use(this.session);
    return server;
  }
}
