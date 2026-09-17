import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { SessionUser, UpdateProfileInput } from '@ft/shared';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AVATAR_ROUTE, AVATAR_STORAGE_DIR } from '../app.setup';

/** Relative on purpose: see setAvatar. */
export const AVATAR_URL_PREFIX = `${AVATAR_ROUTE}/`;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<SessionUser> {
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: input });
      return AuthService.toSessionUser(user);
    } catch (error) {
      // P2002 is the unique constraint on displayName. Same reasoning as signup:
      // checking first would still race another update.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('auth.displayNameTaken');
      }
      throw error;
    }
  }

  /**
   * Relative, not absolute: an url built from the request would carry a forged
   * Host into the database, and next/image rejects unknown hosts. The file to
   * delete comes from the user's own row, never from the request.
   */
  async setAvatar(userId: string, filename: string): Promise<SessionUser> {
    return this.replaceAvatar(userId, `${AVATAR_URL_PREFIX}${filename}`);
  }

  /** Back to the default image, and the file goes with it. */
  async clearAvatar(userId: string): Promise<SessionUser> {
    return this.replaceAvatar(userId, null);
  }

  private async replaceAvatar(userId: string, avatarUrl: string | null): Promise<SessionUser> {
    const before = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });

    if (before.avatarUrl) {
      await this.deleteAvatarFile(before.avatarUrl);
    }
    return AuthService.toSessionUser(user);
  }

  /** Best effort: the row is already updated, so a stuck file costs disk only. */
  private async deleteAvatarFile(avatarUrl: string): Promise<void> {
    // Nothing else should reach the column, but this runs an unlink: check anyway.
    if (!avatarUrl.startsWith(AVATAR_URL_PREFIX)) return;
    const filename = avatarUrl.slice(AVATAR_URL_PREFIX.length);

    try {
      await unlink(join(AVATAR_STORAGE_DIR, basename(filename)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.logger.warn(`could not delete avatar ${filename}: ${String(error)}`);
    }
  }
}
