import { ConflictException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AVATAR_STORAGE_DIR } from '../app.setup';
import type { PrismaService } from '../prisma/prisma.service';
import { AVATAR_URL_PREFIX, UsersService } from './users.service';

vi.mock('fs/promises', () => ({ unlink: vi.fn() }));

/**
 * The unlink is the only destructive thing this service does, and what keeps it
 * to the caller's own file is invisible from a route test.
 */

const ROW = {
  id: 'user-1',
  email: 'a@example.com',
  displayName: 'Ada',
  avatarUrl: null as string | null,
  locale: 'en',
  role: 'USER',
  createdAt: new Date(),
};

function serviceWith(previousAvatarUrl: string | null) {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ avatarUrl: previousAvatarUrl }),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: { avatarUrl?: string | null } }) =>
          Promise.resolve({ ...ROW, ...data }),
        ),
    },
  };
  return { service: new UsersService(prisma as unknown as PrismaService), prisma };
}

beforeEach(() => {
  vi.mocked(unlink).mockReset();
  vi.mocked(unlink).mockResolvedValue(undefined);
});

describe('UsersService avatars', () => {
  it('stores a relative path, never an absolute url', async () => {
    const { service } = serviceWith(null);

    const user = await service.setAvatar('user-1', 'abc.png');

    expect(user.avatarUrl).toBe(`${AVATAR_URL_PREFIX}abc.png`);
    expect(user.avatarUrl?.startsWith('http')).toBe(false);
  });

  it('deletes the file the new avatar replaces', async () => {
    const { service } = serviceWith(`${AVATAR_URL_PREFIX}old.png`);

    await service.setAvatar('user-1', 'new.png');

    expect(unlink).toHaveBeenCalledWith(join(AVATAR_STORAGE_DIR, 'old.png'));
  });

  it('deletes nothing when the user had no avatar', async () => {
    const { service } = serviceWith(null);

    await service.setAvatar('user-1', 'new.png');

    expect(unlink).not.toHaveBeenCalled();
  });

  // Guards the shape the delete path relies on.
  it('ignores a stored value that is not one of our avatar paths', async () => {
    const { service } = serviceWith('https://example.com/someone-elses.png');

    await service.clearAvatar('user-1');

    expect(unlink).not.toHaveBeenCalled();
  });

  // basename keeps a crafted column value inside the storage directory.
  it('never unlinks outside the storage directory', async () => {
    const { service } = serviceWith(`${AVATAR_URL_PREFIX}../../etc/passwd`);

    await service.clearAvatar('user-1');

    expect(unlink).toHaveBeenCalledWith(join(AVATAR_STORAGE_DIR, 'passwd'));
  });

  it('clears the column and removes the file', async () => {
    const { service } = serviceWith(`${AVATAR_URL_PREFIX}mine.png`);

    const user = await service.clearAvatar('user-1');

    expect(user.avatarUrl).toBeNull();
    expect(unlink).toHaveBeenCalledWith(join(AVATAR_STORAGE_DIR, 'mine.png'));
  });

  // The row is already updated, so a failed unlink must not fail the request.
  it('still resolves when the file is already gone', async () => {
    const { service } = serviceWith(`${AVATAR_URL_PREFIX}gone.png`);
    vi.mocked(unlink).mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));

    await expect(service.clearAvatar('user-1')).resolves.toMatchObject({ avatarUrl: null });
  });

  it('still resolves when the file cannot be deleted', async () => {
    const { service } = serviceWith(`${AVATAR_URL_PREFIX}locked.png`);
    vi.mocked(unlink).mockRejectedValue(Object.assign(new Error('nope'), { code: 'EACCES' }));

    await expect(service.clearAvatar('user-1')).resolves.toMatchObject({ avatarUrl: null });
  });
});

describe('UsersService updateProfile', () => {
  it('turns a unique-constraint violation into a conflict', async () => {
    const prisma = {
      user: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) },
    };
    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(service.updateProfile('user-1', { displayName: 'Taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('never touches a file, because it can no longer change the avatar', async () => {
    const prisma = {
      user: { update: vi.fn().mockResolvedValue({ ...ROW, displayName: 'Grace' }) },
    };
    const service = new UsersService(prisma as unknown as PrismaService);

    await service.updateProfile('user-1', { displayName: 'Grace' });

    expect(unlink).not.toHaveBeenCalled();
  });
});
