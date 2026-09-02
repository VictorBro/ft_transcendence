import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CreateUserInput, SessionUser } from '@ft/shared';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';

/**
 * OWASP's second recommended argon2id configuration: 19 MiB, 2 iterations,
 * 1 degree of parallelism. Raising memoryCost is what raises the cost to an
 * attacker, so tune that before the others.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hashing a throwaway string so a login for an unknown email takes as long as
 * one for a real account. Skipping it leaks which emails are registered through
 * response timing alone.
 */
const DUMMY_HASH = argon2.hash('timing-equaliser', ARGON2_OPTIONS);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the owner may see about themselves. Never the password hash. */
  static toSessionUser(user: User): SessionUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async signUp(input: CreateUserInput): Promise<SessionUser> {
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash,
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
      return AuthService.toSessionUser(user);
    } catch (error) {
      // P2002 is the unique constraint on email or displayName. Caught rather
      // than pre-checked: a SELECT before INSERT still races another signup.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('auth.identityTaken');
      }
      throw error;
    }
  }

  /**
   * One message for both failures, so neither reveals whether the email exists.
   * Reports the second factor alongside the user because the caller decides
   * between a full session and a pending one, and a second query for a column
   * this row already carries would be wasted.
   */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<{ user: SessionUser; twoFactorEnabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user === null) {
      await argon2.verify(await DUMMY_HASH, password).catch(() => false);
      throw new UnauthorizedException('auth.invalidCredentials');
    }

    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('auth.invalidCredentials');
    }

    return {
      user: AuthService.toSessionUser(user),
      twoFactorEnabled: user.totpEnabledAt != null,
    };
  }

  /** Re-authentication for privilege changes, where a live session is not enough. */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null) {
      return false;
    }
    return argon2.verify(user.passwordHash, password);
  }

  async findById(id: string): Promise<SessionUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user === null ? null : AuthService.toSessionUser(user);
  }
}
