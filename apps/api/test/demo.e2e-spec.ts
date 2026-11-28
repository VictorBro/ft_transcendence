import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Today } from '@ft/shared';

import { AuthService } from '../src/auth/auth.service';
import { CoursesService } from '../src/courses/courses.service';
import { atLocalTime } from '../src/demo/demo.clock';
import { SocketsService } from '../src/gateway/sockets.service';
import {
  DEMO_FRIENDSHIPS,
  DEMO_MESSAGES,
  DEMO_PROFILES,
  type DemoProfile,
  SMALLEST_LEVEL,
} from '../src/demo/demo.data';
import { buildLearners, type DemoServices, replayLearner, seedDemoSocial } from '../src/demo/demo';
import { areFriends, pendingRequests } from '../src/friends/friend-ids';
import { pairKey } from '../src/friends/pair';
import type { Prisma } from '../src/generated/prisma/client';
import { dayOf } from '../src/lessons/goal';
import { LessonsService } from '../src/lessons/lessons.service';
import { unreadCounts } from '../src/messages/unread';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The demo learners' replay (#85) against a real Postgres, with the services
 * built by hand as the seed builds them. Never the demo learners themselves:
 * the profiles under replay-<stamp> identities, and never the seed's entry
 * point or seedDemo, which would delete the six demo learners of the database.
 *
 * The run instant is injected: 3 minutes past midnight in Tokyo, so chloe's
 * first finish today lands just after her local midnight, still the day
 * before in UTC.
 */
describe('demo learners replay (e2e)', () => {
  const stamp = Date.now();
  const DAY = '2026-10-26';
  const RUN_NOW = new Date(atLocalTime(DAY, 0, 'Asia/Tokyo').getTime() + 3 * 60_000);
  const PASSWORD = 'Correct-Horse-9';

  let prisma: PrismaService;
  let services: DemoServices;
  let fixtureIds: string[] = [];

  /** Every replay-* user this file makes, whatever the test: afterAll deletes them. */
  const REPLAY = { startsWith: 'replay-', endsWith: '@example.com' };

  const profile = (name: string): DemoProfile => DEMO_PROFILES.find((p) => p.name === name)!;

  /** The profile's French course. */
  const french = (name: string) => profile(name).courses.find((course) => course.lang === 'fr')!;

  /** Letters only in lesson ids: an index as base-26 letters, aa, ab… */
  const letters = (index: number) =>
    String.fromCharCode(97 + Math.floor(index / 26)) + String.fromCharCode(97 + (index % 26));

  const fixture = (index: number): Prisma.LessonCreateManyInput => ({
    id: `fr-test-demo-${letters(index)}`,
    lang: 'fr',
    level: 'A1',
    // After the real lessons of the level, and after finish.e2e-spec's.
    position: 9201 + index,
    kind: 'grammar',
    topic: 'pronouns',
    theme: null,
    title: 'Une leçon du testeur',
    summary: 'Une leçon de test.',
    brief: { objective: 'test', points: [], examples: [], pitfalls: [], vocabulary: [] },
    ready: true,
  });

  /**
   * Replays a profile's French course under its own identity, and returns
   * the user's id. French only: every state checked is on French A1, and the
   * extras' levels hold no lesson when this file runs before seed.e2e-spec.
   *
   * The scores come from a series seeded by the email, so the stamp changes
   * them on every run: what is checked must hold whatever they are, as the
   * profiles promise. `email` pins them where a state depends on them.
   */
  const replay = (name: string, email = `replay-${name}-${stamp}@example.com`): Promise<string> =>
    replayLearner(
      services,
      { email, displayName: `replay${stamp}${name}`, password: PASSWORD },
      { ...profile(name), courses: [french(name)] },
      RUN_NOW,
    );

  const today = (userId: string, timeZone: string): Promise<Today> =>
    services.lessons.today(userId, 'fr', timeZone, RUN_NOW);

  /** The achievements of the user's French course. */
  const earned = async (userId: string): Promise<string[]> =>
    (
      await prisma.userAchievement.findMany({
        where: { userLevel: { userId, lang: 'fr' } },
        select: { code: true },
      })
    ).map((row) => row.code);

  beforeAll(async () => {
    prisma = new PrismaService();
    services = {
      prisma,
      auth: new AuthService(prisma),
      // Never attached outside Nest: the replay's level and goal changes reach no socket.
      courses: new CoursesService(prisma, new SocketsService()),
      lessons: new LessonsService(prisma),
    };

    // What an interrupted run may have left: its users first, their results
    // block the lessons (Restrict).
    await prisma.user.deleteMany({ where: { email: REPLAY } });
    await prisma.lesson.deleteMany({ where: { id: { startsWith: 'fr-test-demo-' } } });

    // CI seeds no lesson: fill French A1's ready lessons up to the smallest
    // real level, the size the profiles are written for (see demo.data.ts).
    const held = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1', ready: true } });
    const fixtures = Array.from({ length: Math.max(0, SMALLEST_LEVEL - held) }, (_, i) =>
      fixture(i),
    );
    fixtureIds = fixtures.map((row) => row.id);
    await prisma.lesson.createMany({ data: fixtures });
  });

  afterAll(async () => {
    // The users first: their courses and results cascade, then nothing blocks the lessons.
    await prisma.user.deleteMany({ where: { email: REPLAY } });
    await prisma.lesson.deleteMany({ where: { id: { in: fixtureIds } } });
    await prisma.$disconnect();
  });

  it("replays anna: a 3-day streak whose third day is today's, met, streak3 earned today", async () => {
    const userId = await replay('anna');
    const page = await today(userId, 'Europe/Zurich');

    expect(page.streak).toEqual({ current: 3, best: 3, today: true });
    expect(page.met).toBe(true);
    expect(page.done.map((card) => card.score)).toEqual([80]);
    expect(page.earnedToday).toContain('streak3');
    expect(page.progress.complete).toBe(false);
  });

  it('replays ben: a 10-day streak to keep, 1 of 3 today, A1 kept through a level switch', async () => {
    const userId = await replay('ben');
    const page = await today(userId, 'America/New_York');
    const held = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1', ready: true } });

    expect(page.streak).toEqual({ current: 10, best: 10, today: false });
    // Fewer finishes than lessons: today's lesson was not passed before, so
    // its card shows today's score.
    expect(page.done.map((card) => [card.score, card.status])).toEqual([[75, 'done']]);
    // The goal went from 10 to 30 at his midnight.
    expect(page.target).toBe(3);
    expect(page.met).toBe(false);
    // Progress over the level's ready lessons, real lessons and fixtures alike.
    expect(page.progress.total).toBe(held);
    expect(page.progress.attempted).toBeGreaterThan(0);
    expect(page.progress.complete).toBe(false);
    expect(await earned(userId)).toEqual(expect.arrayContaining(['streak3', 'streak7']));

    // The switch to A2 and back left him on A1 with every A1 result.
    const course = await prisma.userLevel.findUniqueOrThrow({
      where: { userId_lang: { userId, lang: 'fr' } },
      include: { _count: { select: { lessonResults: true } } },
    });
    expect(course.level).toBe('A1');
    expect(course.dailyGoal).toBe(30);
    expect(course._count.lessonResults).toBe(page.progress.attempted);
  });

  it('replays chloe: streak lost, best 7, today 2 of 3 with one failed', async () => {
    const userId = await replay('chloe');
    const page = await today(userId, 'Asia/Tokyo');

    expect(page.day).toBe(DAY);
    expect(page.streak).toEqual({ current: 0, best: 7, today: false });
    expect(page.done.map((card) => card.score)).toEqual([85, 40]);
    expect(page.done.map((card) => card.status)).toEqual(['done', 'failed']);
    expect(page.target).toBe(3);
    expect(page.progress.complete).toBe(false);
    expect(await earned(userId)).toContain('streak7');
  });

  it("stores chloe's finish just after her local midnight on her day, not UTC's", async () => {
    const course = await prisma.userLevel.findFirstOrThrow({
      where: { lang: 'fr', user: { email: `replay-chloe-${stamp}@example.com` } },
    });
    const first = await prisma.lessonResult.findFirstOrThrow({
      where: { userLevelId: course.id },
      orderBy: { finishedAt: 'desc' },
      skip: 1,
    });

    // Her first finish today: 00:01 in Tokyo, 15:01 the day before in UTC.
    expect(first.finishedAt.toISOString().slice(0, 10)).toBe('2026-10-25');
    expect(dayOf(first.day)).toBe(DAY);
  });

  it('replays david: a 6-day streak still alive, nothing done today', async () => {
    const userId = await replay('david');
    const page = await today(userId, 'Europe/London');

    expect(page.streak).toEqual({ current: 6, best: 6, today: false });
    expect(page.done).toEqual([]);
    expect(page.progress.complete).toBe(false);
  });

  // Whether 80% pass depends on the scores: a fixed email pins them, as the
  // seed's demo-eva@example.com does.
  it('replays eva: every lesson of French A1 attempted, the level complete, A2 next', async () => {
    const userId = await replay('eva', 'replay-eva-pinned@example.com');
    const page = await today(userId, 'Europe/Berlin');

    expect(page.progress.attempted).toBe(page.progress.total);
    expect(page.progress.complete).toBe(true);
    expect(page.levelAfter).toBe('A2');
    expect(await earned(userId)).toContain('levelA1');
  });

  // On a server the seed runs before every release: a learner that fails is
  // skipped, never a failed seed (infra/deploy/deploy.sh).
  it('skips a learner that fails, deletes what it wrote, and builds the next', async () => {
    const taken = `replay${stamp}taken`;
    const holder = await services.auth.signUp({
      email: `replay-holder-${stamp}@example.com`,
      displayName: taken,
      password: PASSWORD,
    });
    const identity = (name: string, displayName = `replay${stamp}${name}b`) => ({
      email: `replay-build-${name}-${stamp}@example.com`,
      displayName,
      password: PASSWORD,
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let logged: string[] = [];

    const ids = await buildLearners(
      services,
      [
        // Its display name is held by an account outside the demo emails:
        // auth.identityTaken at the signup, before anything is written.
        {
          identity: identity('anna', taken),
          profile: { ...profile('anna'), courses: [french('anna')] },
        },
        // Signed up, then its second French course fails: a half-built learner.
        {
          identity: identity('ben'),
          profile: { ...profile('ben'), courses: [french('anna'), french('anna')] },
        },
        {
          identity: identity('david'),
          profile: { ...profile('david'), courses: [french('david')] },
        },
      ],
      RUN_NOW,
    ).finally(() => {
      // Read before the restore, which clears them.
      logged = errors.mock.calls.map(([message]) => String(message));
      errors.mockRestore();
    });

    expect([...ids.keys()]).toEqual(['david']);
    expect(logged).toEqual([
      `demo learner ${identity('anna').email} skipped:`,
      `demo learner ${identity('ben').email} skipped:`,
    ]);
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'replay-build-' } },
      select: { id: true, email: true },
    });
    expect(users).toEqual([{ id: ids.get('david'), email: identity('david').email }]);
    // The account holding the name is not a demo learner: untouched.
    expect(await prisma.user.findUnique({ where: { id: holder.id } })).not.toBeNull();
  });

  describe('seedDemoSocial', () => {
    /** Six bare users, one a profile: nothing of their courses matters here. */
    const bareUsers = async (tag: string): Promise<Map<string, string>> => {
      const ids = new Map<string, string>();
      for (const { name } of DEMO_PROFILES) {
        const user = await prisma.user.create({
          data: {
            email: `replay-${tag}-${name}-${stamp}@example.com`,
            displayName: `replay${stamp}${tag}${name}`,
            passwordHash: 'not a hash: nobody signs in',
          },
        });
        ids.set(name, user.id);
      }
      return ids;
    };

    it("gives anna two friends, a request waiting on her, and ben's two unread messages", async () => {
      const ids = await bareUsers('social');
      const id = (name: string) => ids.get(name)!;
      await seedDemoSocial(prisma, ids, RUN_NOW);

      expect((await pendingRequests(prisma, id('anna'))).count).toBe(1);
      expect((await unreadCounts(prisma, id('anna'))).counts).toEqual({ [id('ben')]: 2 });
      expect(await areFriends(prisma, id('anna'), id('ben'))).toBe(true);
      expect(await areFriends(prisma, id('anna'), id('chloe'))).toBe(true);
      // Pending, either way: not a friendship.
      expect(await areFriends(prisma, id('anna'), id('felix'))).toBe(false);
      expect(await areFriends(prisma, id('anna'), id('david'))).toBe(false);

      // Keyed as MessagesService.send keys them: the smaller id first.
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { pairKey: pairKey(id('anna'), id('ben')) },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      expect(conversation.userAId < conversation.userBId).toBe(true);
      expect(conversation.messages.map((m) => m.readAt)).toEqual([null, null]);
      expect(conversation.lastMessageAt).toEqual(conversation.messages.at(-1)!.createdAt);
      expect(conversation.lastMessageAt.getTime()).toBeLessThan(RUN_NOW.getTime());
    });

    it('leaves out every row of a learner that was skipped', async () => {
      const ids = await bareUsers('skipped');
      const ben = ids.get('ben')!;
      ids.delete('ben');
      await seedDemoSocial(prisma, ids, RUN_NOW);

      const mine = [...ids.values()];
      const friendships = await prisma.friendship.count({ where: { requesterId: { in: mine } } });
      const withBen = DEMO_FRIENDSHIPS.filter((f) => f.from === 'ben' || f.to === 'ben').length;
      expect(friendships).toBe(DEMO_FRIENDSHIPS.length - withBen);
      expect(await prisma.message.count({ where: { senderId: { in: mine } } })).toBe(
        DEMO_MESSAGES.filter((m) => m.from !== 'ben' && m.to !== 'ben').length,
      );
      expect((await unreadCounts(prisma, ids.get('anna')!)).counts).toEqual({});
      // ben's bare user, left out of the map, gets nothing.
      expect(
        await prisma.friendship.count({
          where: { OR: [{ requesterId: ben }, { addresseeId: ben }] },
        }),
      ).toBe(0);
    });
  });
});
