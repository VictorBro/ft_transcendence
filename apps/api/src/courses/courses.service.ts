import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { StartCourseDto, SetGoalDto, SetLevelDto } from './courses.dto';
import { CourseSchema, DailyGoal, Language, Level, SessionUser } from '@ft/shared';
import { PrismaService } from '../prisma/prisma.service';
import { checkCourse } from '../lessons/course-lookup';
import { currentDay, lockCourse, meetGoal } from '../lessons/goal';

const COURSE_SELECT = { lang: true, dailyGoal: true, level: true } as const;
type CourseWrite = { dailyGoal: DailyGoal; level?: never } | { level: Level; dailyGoal?: never };

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCoursesUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        activeLang: true,
        userLevels: { select: COURSE_SELECT, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('auth.sessionRequired');
    }
    return { courses: user.userLevels, activeLang: user.activeLang };
  }

  async createCourse(userId: string, dto: StartCourseDto) {
    try {
      const course = await this.prisma.userLevel.create({
        data: { userId, lang: dto.lang, dailyGoal: dto.dailyGoal, level: null },
        select: COURSE_SELECT,
      });
      return CourseSchema.parse(course);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('course.alreadyStarted');
      }
      throw error;
    }
  }

  /**
   * Under the course lock, like a finish (lessons/goal.ts): a lower goal can
   * meet today with the lessons already done, and a finish at the same moment
   * must not meet it a second time. A higher goal never unmeets a day.
   */
  setGoal(user: SessionUser, lang: Language, dto: SetGoalDto, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const locked = checkCourse(await lockCourse(tx, user.id, lang));
      const course = await tx.userLevel.update({
        where: { id: locked.id },
        data: { dailyGoal: dto.dailyGoal },
      });
      await tx.user.update({ where: { id: user.id }, data: { activeLang: lang } });

      await meetGoal(tx, course, await currentDay(tx, course, user.timeZone, now));
      return CourseSchema.parse(course);
    });
  }

  setLevel(userId: string, lang: Language, dto: SetLevelDto) {
    return this.write(userId, lang, { level: dto.level });
  }

  private async write(userId: string, lang: Language, data: CourseWrite) {
    try {
      const [course] = await this.prisma.$transaction([
        this.prisma.userLevel.update({
          where: { userId_lang: { userId, lang } },
          data,
          select: COURSE_SELECT,
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { activeLang: lang },
        }),
      ]);
      return CourseSchema.parse(course);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025')
        throw new NotFoundException('course.notFound');
      throw error;
    }
  }
}
