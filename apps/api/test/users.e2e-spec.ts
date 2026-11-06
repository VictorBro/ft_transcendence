import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_AVATAR_BYTES } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { AVATAR_STORAGE_DIR, configureApp } from '../src/app.setup';
import { localDay, previousDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Upload only exists once multer, the static route and the session guard run
 * together, and the rejections happen before the handler body. A 1x1 PNG.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;
  let myId = '';

  const email = `avatar-${Date.now()}@example.com`;
  const displayName = `avatar${Date.now()}`;
  /** The profile owner, written straight to the database: no signup to wait on. */
  const ownerEmail = `profile-${Date.now()}@example.com`;
  const written: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/signup')
      .send({ email, displayName, password: 'Correct-Horse-9' })
      .expect(201);
    myId = res.body.id;
  });

  afterAll(async () => {
    await Promise.all(written.map((f) => rm(join(AVATAR_STORAGE_DIR, f), { force: true })));
    // Courses cascade.
    await prisma.user.deleteMany({ where: { email: { in: [email, ownerEmail] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();
  const filenameOf = (avatarUrl: string) => avatarUrl.split('/').pop() ?? '';

  describe('avatars', () => {
    it('refuses an anonymous upload', async () => {
      await request(server())
        .post('/api/users/me/avatar')
        .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(401);
    });

    it('stores a relative path and serves the file back', async () => {
      const response = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);

      const avatarUrl: string = response.body.avatarUrl;
      written.push(filenameOf(avatarUrl));

      // Relative, so a forged Host never reaches the database.
      expect(avatarUrl).toMatch(/^\/api\/uploads\/avatars\/[0-9a-f-]+\.png$/);

      // Proves the repeated "api" prefix on the static route.
      await request(server())
        .get(avatarUrl)
        .expect(200)
        .expect('content-type', /image\/png/);
    });

    it('deletes the previous file when the avatar is replaced', async () => {
      const first = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const oldFile = filenameOf(first.body.avatarUrl);

      const second = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', PNG, { filename: 'b.png', contentType: 'image/png' })
        .expect(201);
      written.push(filenameOf(second.body.avatarUrl));

      expect(await readdir(AVATAR_STORAGE_DIR)).not.toContain(oldFile);
    });

    it('rejects a type that is not an image, with a code the browser can translate', async () => {
      const response = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', Buffer.from('%PDF-1.4'), {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(response.body.message).toBe('avatar.invalidFile');
    });

    // Without reading the bytes, anything can be stored and served back as an image.
    it('rejects a file whose bytes are not the type it claims, and keeps nothing', async () => {
      const before = await readdir(AVATAR_STORAGE_DIR);

      const response = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', Buffer.from('MZ\x90\x00this is not a png at all'), {
          filename: 'payload.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(response.body.message).toBe('avatar.invalidFile');
      expect(await readdir(AVATAR_STORAGE_DIR)).toEqual(before);
    });

    // Nest's default here is the sentence "File too large", which renders as
    // "unknown" in the browser.
    it('rejects an oversized file with a code, not a sentence', async () => {
      const response = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', Buffer.alloc(MAX_AVATAR_BYTES + 1), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);

      expect(response.body.message).toBe('avatar.invalidFile');
    });

    it('removes the avatar and its file', async () => {
      const uploaded = await agent
        .post('/api/users/me/avatar')
        .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const file = filenameOf(uploaded.body.avatarUrl);

      const response = await agent.delete('/api/users/me/avatar').expect(200);

      expect(response.body.avatarUrl).toBeNull();
      expect(await readdir(AVATAR_STORAGE_DIR)).not.toContain(file);
    });

    // The column names a file on our disk, so the generic patch must not set it.
    it('will not let the profile patch set an avatar url', async () => {
      await agent
        .patch('/api/users/me')
        .send({ avatarUrl: '/api/uploads/avatars/someone-elses.png' })
        .expect(400);
    });
  });

  describe('time zone', () => {
    // Kyiv last: Intl calls it Europe/Kiev, and a renamed copy would never match
    // what the browser sends, so the row must hold the string as given.
    it('stores a time zone exactly as sent', async () => {
      for (const timeZone of ['UTC', 'Etc/UTC', 'Europe/Kyiv']) {
        const response = await agent.patch('/api/users/me').send({ timeZone }).expect(200);
        expect(response.body.timeZone).toBe(timeZone);
      }

      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.timeZone).toBe('Europe/Kyiv');
    });

    it('rejects an unknown time zone with a code', async () => {
      const response = await agent
        .patch('/api/users/me')
        .send({ timeZone: 'Mars/Olympus' })
        .expect(400);

      // CodeValidationPipe puts the Zod issues' codes in `message`, where readCode looks.
      expect(response.body.message).toEqual(['profile.invalidTimeZone']);
    });
  });

  describe('profile', () => {
    it('shows the public fields and nothing else', async () => {
      const timeZone = 'Asia/Tokyo';
      const yesterday = previousDay(localDay(new Date(), timeZone));
      const owner = await prisma.user.create({
        data: {
          email: ownerEmail,
          displayName: `profile${Date.now()}`,
          passwordHash: 'unused',
          timeZone,
          totpSecret: 'unused',
          totpEnabledAt: new Date(),
          lastSeenAt: new Date(),
          userLevels: {
            create: [
              // createdAt set: one statement would otherwise give both the same.
              {
                lang: 'fr',
                level: 'B1',
                dailyGoal: 10,
                streak: 4,
                bestStreak: 9,
                lastGoalDay: new Date(yesterday),
                createdAt: new Date('2026-01-01'),
              },
              // A streak met long ago is gone, whatever the column still says.
              {
                lang: 'de',
                level: null,
                dailyGoal: 30,
                streak: 9,
                bestStreak: 9,
                lastGoalDay: new Date('2026-01-01'),
                createdAt: new Date('2026-01-02'),
              },
            ],
          },
        },
      });

      const res = await agent.get(`/api/users/${owner.id}`).expect(200);

      expect(res.body).toEqual({
        id: owner.id,
        displayName: owner.displayName,
        avatarUrl: null,
        courses: [
          { lang: 'fr', level: 'B1', streak: 4 },
          { lang: 'de', level: null, streak: 0 },
        ],
      });
      // What /privacy says others see, and nothing more: no email, 2FA, time zone.
      expect(Object.keys(res.body).sort()).toEqual(['avatarUrl', 'courses', 'displayName', 'id']);
      expect(Object.keys(res.body.courses[0]).sort()).toEqual(['lang', 'level', 'streak']);
    });

    it('shows you your own, as others see it', async () => {
      const res = await agent.get(`/api/users/${myId}`).expect(200);

      expect(res.body).toMatchObject({ id: myId, displayName, courses: [] });
    });

    it('answers 404 for an unknown id and 400 for a malformed one', async () => {
      const unknown = await agent.get(`/api/users/${randomUUID()}`).expect(404);
      expect(unknown.body.message).toBe('user.notFound');

      const malformed = await agent.get('/api/users/not-a-uuid').expect(400);
      expect(malformed.body.message).toEqual(['request.invalid']);
    });
  });
});
