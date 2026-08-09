import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAll = vi.fn();
const redirect = vi.fn(() => {
  // Next's redirect throws to unwind the render; mirroring that keeps
  // requireUser's "never returns null" contract honest in the test.
  throw new Error('NEXT_REDIRECT');
});
const fetchSession = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll }) }));
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
    fetchSession.mockResolvedValue(user);

    await expect(currentUser()).resolves.toEqual(user);
    expect(fetchSession).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: 'ft.sid=abc; other=xyz' }),
    );
  });

  it('sends an empty cookie header when the browser has none', async () => {
    getAll.mockReturnValue([]);
    fetchSession.mockResolvedValue(null);

    await expect(currentUser()).resolves.toBeNull();
    expect(fetchSession).toHaveBeenCalledWith(expect.objectContaining({ cookie: '' }));
  });
});

describe('requireUser', () => {
  it('returns the user when there is a session', async () => {
    getAll.mockReturnValue([{ name: 'ft.sid', value: 'abc' }]);
    fetchSession.mockResolvedValue(user);

    await expect(requireUser()).resolves.toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to the login page when there is not', async () => {
    getAll.mockReturnValue([]);
    fetchSession.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
