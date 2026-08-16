import { ConflictException, Injectable } from '@nestjs/common';
import type { SessionUser, UpdateProfileInput } from '@ft/shared';
import { unlink } from 'fs/promises';
import { join } from 'path';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AVATAR_STORAGE_DIR } from '../app.setup';

const AVATAR_FILE_PATTERN = /^[0-9a-f-]{36}\.(?:png|jpg|webp)$/;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<SessionUser> {
    const previousPath =
      input.avatarUrl !== undefined
        ? await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } })
        : null;
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: input });
      if (previousPath?.avatarUrl && previousPath.avatarUrl !== user.avatarUrl) {
        await this.deleteAvatarFile(previousPath.avatarUrl);
      }
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
        throw new ConflictException('That display name is already taken');
      }
      throw error;
    }
  }

  async deleteAvatarFile(avatarUrl: string): Promise<void> {
    const filename = avatarUrl.split('/').pop() ?? '';
    if (!AVATAR_FILE_PATTERN.test(filename)) return; // Don't delete anything outside the avatars folder

    try {
      await unlink(join(AVATAR_STORAGE_DIR, filename));
    } catch {
      // log error ?
    }
  }
}
