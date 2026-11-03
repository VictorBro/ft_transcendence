import { describe, expect, it, vi } from 'vitest';

import { seriesValue } from '../../test/metrics.fixtures';
import { wsEvents } from '../metrics/metrics';
import { SocketsService, type SocketServer } from './sockets.service';

/** The two calls the service makes, each recording the room it addressed. */
function fakeServer() {
  const emit = vi.fn();
  const disconnectSockets = vi.fn();
  const server = {
    to: vi.fn(() => ({ emit })),
    in: vi.fn(() => ({ disconnectSockets })),
  };
  return { server, emit, disconnectSockets };
}

describe('SocketsService', () => {
  it("emits to the user's room only, and counts it", async () => {
    const { server, emit } = fakeServer();
    const sockets = new SocketsService();
    sockets.attach(server as unknown as SocketServer);
    const out = { direction: 'out', event: 'course:updated', outcome: 'ok' };
    const before = (await seriesValue(wsEvents, out)) ?? 0;

    sockets.toUser('user-1', 'course:updated', { lang: 'fr' });

    expect(server.to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('course:updated', { lang: 'fr' });
    expect(await seriesValue(wsEvents, out)).toBe(before + 1);
  });

  // The seed and the demo spec build services by hand, with no socket.io at all.
  it('does nothing before the gateway attaches', () => {
    expect(() =>
      new SocketsService().toUser('user-1', 'course:updated', { lang: 'fr' }),
    ).not.toThrow();
    expect(() => new SocketsService().closeSession('sid-1')).not.toThrow();
  });

  it("closes that session's sockets and no one else's", () => {
    const { server, disconnectSockets } = fakeServer();
    const sockets = new SocketsService();
    sockets.attach(server as unknown as SocketServer);

    sockets.closeSession('sid-1');

    expect(server.in).toHaveBeenCalledWith('session:sid-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
