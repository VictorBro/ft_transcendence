import type { Page, WebSocket } from '@playwright/test';

/**
 * Resolves once the page's next socket is in its user room: the server joins
 * the room before socket.io's CONNECT reply ("40"), so the reply means a server
 * emit will reach the page. Arm it before the action that opens the socket;
 * the listeners attach at once, so no frame goes by unseen.
 */
export const liveConnection = (page: Page, ms = 10_000): Promise<void> =>
  new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      page.off('websocket', onSocket);
      page.off('close', stop);
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`no socket.io CONNECT reply on /ws within ${ms} ms`));
    }, ms);
    function onSocket(ws: WebSocket): void {
      // socket.io asks for /ws/?EIO=4&transport=websocket.
      if (new URL(ws.url()).pathname !== '/ws/') return;
      ws.on('framereceived', ({ payload }) => {
        if (!String(payload).startsWith('40')) return;
        stop();
        resolve();
      });
    }
    page.on('websocket', onSocket);
    // A test that failed earlier closes the page: nobody waits any more, and a
    // late rejection would only land as an unhandled one.
    page.on('close', stop);
  });
