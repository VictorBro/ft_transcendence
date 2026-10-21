import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/*
 * Hides the finish route until the lesson page exists (next milestone). Until
 * then nothing in the app sends a score, so only dev, CI and the Playwright
 * stack turn it on with LESSON_STUB=true. The deployed server never sets it:
 * there, the route answers like a lesson that is not there.
 *
 * Read on every request, not once at boot, so a test can unset it.
 */
@Injectable()
export class LessonStubGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.LESSON_STUB !== 'true') {
      throw new NotFoundException('lesson.notFound');
    }
    return true;
  }
}
