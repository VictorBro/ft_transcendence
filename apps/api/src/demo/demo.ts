import type { Language, SessionUser } from '@ft/shared';

import { AuthService } from '../auth/auth.service';
import { CoursesService } from '../courses/courses.service';
import { LessonsService } from '../lessons/lessons.service';
import type { RuleLesson } from '../lessons/roadmap.rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMO_EMAIL_FILTER,
  DEMO_PROFILES,
  type DemoCourse,
  type DemoProfile,
  demoDisplayName,
  demoEmail,
} from './demo.data';
import { planCourse } from './demo.planner';

/*
 * The demo learners (#85), replayed through the real services day by day
 * with an injected clock. Never progress rows written by hand: finish and
 * setLevel decide every streak and result, so the learners follow every
 * rule, and whatever finish gains later (XP, #95) they gain too.
 *
 * Runs in the seed, under tsx, so outside Nest: the services are built by
 * hand. This file is in src/, so a service that gains a dependency fails the
 * typecheck here, not the seed.
 */

/**
 * What the replay calls. `prisma` too: the time zone is written straight on
 * the user (a profile field, not progress), which keeps UsersService and its
 * AVATAR_STORAGE_DIR check out of the seed, and eva's plan reads her level.
 */
export type DemoServices = {
  prisma: PrismaService;
  auth: AuthService;
  courses: CoursesService;
  lessons: LessonsService;
};

/** Who the replay signs up: the demo learners in the seed, replay-<stamp> in the e2e spec. */
export type DemoIdentity = { email: string; displayName: string; password: string };

/**
 * The level's ready lessons as the rules see them, in order: the plan offers
 * no other (#84), so "every lesson attempted" means every ready one.
 */
function levelLessons(prisma: PrismaService, course: DemoCourse): Promise<RuleLesson[]> {
  if (course.level === null) {
    return Promise.resolve([]);
  }
  return prisma.lesson.findMany({
    where: { lang: course.lang, level: course.level, ready: true },
    orderBy: { position: 'asc' },
    select: { id: true, level: true, position: true, ready: true },
  });
}

/**
 * One course, from its creation to today. Each day: its level switches, then
 * the lessons today's page proposes (then its extra), as many as the plan
 * finishes that day.
 *
 * One read of today a day is enough: a lesson finished today leaves the
 * queue and the others keep their order, so the first N ids are the ones a
 * learner reloading the page after each finish would have taken.
 */
async function replayCourse(
  services: DemoServices,
  user: SessionUser,
  course: DemoCourse,
  runNow: Date,
): Promise<void> {
  const { courses, lessons } = services;
  const lang: Language = course.lang;

  await courses.createCourse(user.id, { lang, dailyGoal: course.goal });
  if (course.level !== null) {
    await courses.setLevel(user.id, lang, { level: course.level });
  }

  const level = Array.isArray(course.days) ? [] : await levelLessons(services.prisma, course);
  for (const day of planCourse(user.email, user.timeZone, course, runNow, level)) {
    for (const switchTo of day.switches) {
      await courses.setLevel(user.id, lang, { level: switchTo });
    }
    // No finish, no read: a course without a level would answer 409.
    if (day.finishes.length === 0) {
      continue;
    }

    // Only ready lessons are offered (#84), and until #91 to #93 only French
    // A1 has any: an extra course on another level finishes what its level
    // offers, often nothing, rather than failing the seed.
    const today = await lessons.today(user.id, lang, user.timeZone, day.finishes[0].at);
    const offered = [...today.proposed, ...today.extra];
    for (const [i, finish] of day.finishes.slice(0, offered.length).entries()) {
      await lessons.finish(user, lang, offered[i].id, finish.score, finish.at);
    }
  }
}

/**
 * Builds one learner: signs up, sets the time zone, replays each course in
 * the profile's order. Deletes nothing: the caller clears the old ones.
 */
export async function replayLearner(
  services: DemoServices,
  identity: DemoIdentity,
  profile: DemoProfile,
  runNow: Date,
): Promise<void> {
  const created = await services.auth.signUp(identity);
  await services.prisma.user.update({
    where: { id: created.id },
    data: { timeZone: profile.timeZone },
  });
  // Read again: the SessionUser from signUp still says UTC, and finish takes
  // the day from the user it is given.
  const user = await services.auth.findById(created.id);
  if (user === null) {
    throw new Error(`${identity.email} disappeared right after its signup`);
  }

  for (const course of profile.courses) {
    await replayCourse(services, user, course, runNow);
  }
}

/**
 * Deletes the demo learners and builds them again, so their today is always
 * the run's and their lessons the catalogue's. The cascade takes their
 * courses and results. A teammate signed in as one is signed out: new ids.
 */
export async function seedDemo(
  prisma: PrismaService,
  options: { runNow: Date; password: string },
): Promise<void> {
  const services: DemoServices = {
    prisma,
    auth: new AuthService(prisma),
    courses: new CoursesService(prisma),
    lessons: new LessonsService(prisma),
  };

  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL_FILTER } });

  for (const profile of DEMO_PROFILES) {
    const identity = {
      email: demoEmail(profile.name),
      displayName: demoDisplayName(profile.name),
      password: options.password,
    };
    try {
      await replayLearner(services, identity, profile, options.runNow);
    } catch (err) {
      // auth.identityTaken here: someone took demo.<name> by hand.
      throw new Error(`demo learner ${identity.email} failed`, { cause: err });
    }
  }

  const emails = DEMO_PROFILES.map((profile) => demoEmail(profile.name));
  console.log(`seeded ${emails.length} demo learners: ${emails.join(', ')}`);
}
