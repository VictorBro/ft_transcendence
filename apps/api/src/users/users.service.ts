import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RECENTLY_ACTIVE_LIMIT, USER_SEARCH_LIMIT } from '@ft/shared';
import type {
  PublicProfile,
  RecentlyActive,
  SessionUser,
  UpdateProfileInput,
  UserSearchResult,
} from '@ft/shared';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AVATAR_ROUTE, AVATAR_STORAGE_DIR } from '../app.setup';
import { currentDay, storedStreak } from '../lessons/goal';
import { currentStreak } from '../lessons/roadmap.rules';
import { activeSince } from './active-day';
import { PUBLIC_USER_SELECT } from './public-user';

/** Relative on purpose: see setAvatar. */
export const AVATAR_URL_PREFIX = `${AVATAR_ROUTE}/`;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Display names containing `q`, in any case, never your own. Prisma passes
   * `contains` to ILIKE as is, so `_`, which a name may hold, is escaped to mean
   * itself (and `%` and `\` too, should the query ever allow them).
   */
  async search(me: string, q: string): Promise<UserSearchResult> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: me },
        displayName: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' },
      },
      select: PUBLIC_USER_SELECT,
      orderBy: { displayName: 'asc' },
      take: USER_SEARCH_LIMIT,
    });
    return { users };
  }

  /**
   * What any signed-in user may see of `id`. The time zone is read only to
   * find the owner's day for the streak, so each field is copied by name.
   */
  async profile(id: string, now: Date): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        timeZone: true,
        userLevels: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (user === null) {
      throw new NotFoundException('user.notFound');
    }

    // The course page's day and rule, so both show the same streak.
    const courses = await Promise.all(
      user.userLevels.map(async (course) => {
        const day = await currentDay(this.prisma, course, user.timeZone, now);
        const streak = currentStreak(storedStreak(course), day);
        return { lang: course.lang, level: course.level, streak };
      }),
    );
    return { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, courses };
  }

  /**
   * People to add: whoever opened the app in the last week. Never you, and
   * never someone you already have a request or friendship with, so the only
   * thing to do with a row is Add friend. By name, not by day: an order by
   * activity would show anyone polling it each learner's first visit of the day.
   */
  async recentlyActive(me: string, now: Date): Promise<RecentlyActive> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: me },
        lastActiveDay: { gte: activeSince(now) },
        friendshipsRequested: { none: { addresseeId: me } },
        friendshipsAddressed: { none: { requesterId: me } },
      },
      select: {
        ...PUBLIC_USER_SELECT,
        userLevels: { select: { lang: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { displayName: 'asc' },
      take: RECENTLY_ACTIVE_LIMIT,
    });
    return {
      users: users.map(({ userLevels, ...user }) => ({
        ...user,
        languages: userLevels.map((course) => course.lang),
      })),
    };
  }

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
