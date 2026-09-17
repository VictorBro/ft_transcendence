import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_AVATAR_BYTES } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { AVATAR_STORAGE_DIR, configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Upload only exists once multer, the static route and the session guard run
 * together, and the rejections happen before the handler body. A 1x1 PNG.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('users avatars (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;

  const email = `avatar-${Date.now()}@example.com`;
  const displayName = `avatar${Date.now()}`;
  const written: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName, password: 'Correct-Horse-9' })
      .expect(201);
  });

  afterAll(async () => {
    await Promise.all(written.map((f) => rm(join(AVATAR_STORAGE_DIR, f), { force: true })));
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const server = () => app.getHttpServer();
  const filenameOf = (avatarUrl: string) => avatarUrl.split('/').pop() ?? '';

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
