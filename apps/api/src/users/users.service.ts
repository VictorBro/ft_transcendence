import { ConflictException, Injectable } from '@nestjs/common';
import type { SessionUser, UpdateProfileInput } from '@ft/shared';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
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
        throw new ConflictException('That display name is already taken');
      }
      throw error;
    }
  }
}
