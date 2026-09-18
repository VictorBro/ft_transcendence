import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { StartCourseDto, SetGoalDto, SetLevelDto } from './courses.dto';
import { CourseSchema, DailyGoal, Language, Level } from '@ft/shared';
import { PrismaService } from '../prisma/prisma.service';

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
      throw new UnauthorizedException();
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
        throw new ConflictException('course.alreadyExists');
      }
      throw error;
    }
  }

  setGoal(userId: string, lang: Language, dto: SetGoalDto) {
    return this.write(userId, lang, { dailyGoal: dto.dailyGoal });
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
