import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAll = vi.fn();
const getHeader = vi.fn();
const redirect = vi.fn(() => {
  // Next's redirect throws to unwind the render; mirroring that keeps
  // requireUser's "never returns null" contract honest in the test.
  throw new Error('NEXT_REDIRECT');
});
const fetchSession = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll }),
  headers: async () => ({ get: getHeader }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('./api', () => ({ fetchSession }));

const { currentUser, requireUser } = await import('./session');

const user = { id: 'u1', displayName: 'learner' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('currentUser', () => {
  // Without this the internal request is anonymous and every page believes
  // nobody is signed in.
  it('forwards the browser cookies as one header', async () => {
    getAll.mockReturnValue([
      { name: 'ft.sid', value: 'abc' },
      { name: 'other', value: 'xyz' },
    ]);
    fetchSession.mockResolvedValue({ status: 'ok', user });

    await expect(currentUser()).resolves.toEqual(user);
    expect(fetchSession).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: 'ft.sid=abc; other=xyz' }),
    );
  });

  it('sends an empty cookie header when the browser has none', async () => {
    getAll.mockReturnValue([]);
    fetchSession.mockResolvedValue({ status: 'signed-out' });

    await expect(currentUser()).resolves.toBeNull();
    expect(fetchSession).toHaveBeenCalledWith(expect.objectContaining({ cookie: '' }));
  });

  // This call reaches the API from the web container, so without the header
  // every signed-out visitor on the site is rate-limited on one shared key.
  it('forwards the visitor address unchanged', async () => {
    getAll.mockReturnValue([]);
    getHeader.mockReturnValue('88.10.20.30');
    fetchSession.mockResolvedValue({ status: 'signed-out' });

    await currentUser();
    expect(getHeader).toHaveBeenCalledWith('x-forwarded-for');
    expect(fetchSession).toHaveBeenCalledWith(
      expect.objectContaining({ forwardedFor: '88.10.20.30' }),
    );
  });

  // headers().get() answers null, which would serialise as the string "null".
  it('omits the address when the header is absent', async () => {
    getAll.mockReturnValue([]);
    getHeader.mockReturnValue(null);
    fetchSession.mockResolvedValue({ status: 'signed-out' });

    await currentUser();
    expect(fetchSession).toHaveBeenCalledWith(expect.objectContaining({ forwardedFor: undefined }));
  });

  // Public pages only hide the signed-in view; they must never redirect.
  it('degrades to null when the API is unavailable', async () => {
    getAll.mockReturnValue([]);
    fetchSession.mockResolvedValue({ status: 'unavailable', reason: 'http 500' });

    await expect(currentUser()).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('requireUser', () => {
  it('returns the user when there is a session', async () => {
    getAll.mockReturnValue([{ name: 'ft.sid', value: 'abc' }]);
    fetchSession.mockResolvedValue({ status: 'ok', user });

    await expect(requireUser()).resolves.toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to the login page when there is not', async () => {
    getAll.mockReturnValue([]);
    fetchSession.mockResolvedValue({ status: 'signed-out' });

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  // The bug this replaces: a 429 or a 5xx collapsed into null, so a perfectly
  // signed-in visitor was redirected to /login and lost their session.
  it('throws instead of redirecting when the API is unavailable', async () => {
    getAll.mockReturnValue([{ name: 'ft.sid', value: 'abc' }]);
    fetchSession.mockResolvedValue({ status: 'unavailable', reason: 'http 429' });

    await expect(requireUser()).rejects.toThrow(/^(?!NEXT_REDIRECT)/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
