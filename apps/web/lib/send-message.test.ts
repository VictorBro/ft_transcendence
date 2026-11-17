import { describe, expect, it, vi } from 'vitest';

import { SEND_TIMEOUT_MS, sendMessageOver } from './send-message';

const them = '0b6f8a52-3c1e-4d7a-9f2b-5e8c1a4d7b90';

const stored = {
  id: '6f1c2b0e-9a4d-4e7b-8c3a-2d5f7e9b1a04',
  senderId: '00000000-0000-4000-8000-000000000001',
  text: 'salut',
  createdAt: '2026-11-16T10:00:00.000Z',
};

/** The tab socket as a send sees it: connected or not, and what the server answers. */
function fakeSocket(connected: boolean, answer: () => Promise<unknown>) {
  const emitWithAck = vi.fn(answer);
  const timeout = vi.fn(() => ({ emitWithAck }));
  return { socket: { connected, timeout }, timeout, emitWithAck };
}

describe('sendMessageOver', () => {
  it('sends to the other user and gives back the stored message', async () => {
    const { socket, timeout, emitWithAck } = fakeSocket(true, async () => ({
      ok: true,
      data: stored,
    }));

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: true,
      data: stored,
    });
    expect(timeout).toHaveBeenCalledWith(SEND_TIMEOUT_MS);
    expect(emitWithAck).toHaveBeenCalledWith('dm:send', { userId: them, text: 'salut' });
  });

  it('refuses at once while not connected, and sends nothing', async () => {
    const { socket, emitWithAck } = fakeSocket(false, async () => ({ ok: true, data: stored }));

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
    });
    expect(emitWithAck).not.toHaveBeenCalled();
  });

  // socket.io rejects on its timeout, and on a disconnect before the answer.
  it('reads an answer that never came as an unreachable server', async () => {
    const { socket } = fakeSocket(true, async () => {
      throw new Error('operation has timed out');
    });

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
    });
  });

  it('passes a refusal on as its code', async () => {
    const { socket } = fakeSocket(true, async () => ({ ok: false, code: 'message.notFriends' }));

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: false,
      code: 'message.notFriends',
    });
  });

  it('words a server failure without an HTTP status', async () => {
    const { socket } = fakeSocket(true, async () => ({ ok: false, code: 'server.unexpected' }));

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it.each([
    ['nothing', undefined],
    ['a message without its id', { ok: true, data: { ...stored, id: undefined } }],
    ['an unknown code', { ok: false, code: 'nope' }],
  ])('reads %s as an unknown failure', async (_, answer) => {
    const { socket } = fakeSocket(true, async () => answer);

    await expect(sendMessageOver(socket, them, 'salut')).resolves.toEqual({
      ok: false,
      code: 'unknown',
    });
  });
});
