import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const password = 'Correct-Horse-9';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'learner@example.com',
    displayName: 'learner',
    passwordHash: 'replaced in beforeEach',
    avatarUrl: null,
    locale: 'en',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  const prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
  let service: AuthService;
  let hash: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    hash ??= await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('signUp', () => {
    it('stores an argon2id hash, never the password', async () => {
      prisma.user.create.mockResolvedValue(userRow({ passwordHash: 'x' }));

      await service.signUp({ email: 'A@Example.com', displayName: 'learner', password });

      const stored = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(stored).toMatch(/^\$argon2id\$/);
      expect(stored).not.toContain(password);
      await expect(argon2.verify(stored, password)).resolves.toBe(true);
    });

    it('lower-cases the email so Alice@ and alice@ are one account', async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await service.signUp({ email: 'A@Example.com', displayName: 'learner', password });

      expect(prisma.user.create.mock.calls[0][0].data.email).toBe('a@example.com');
    });

    it('never returns the password hash', async () => {
      prisma.user.create.mockResolvedValue(userRow());

      const user = await service.signUp({ email: 'a@b.co', displayName: 'learner', password });

      expect(user).not.toHaveProperty('passwordHash');
      expect(Object.keys(user)).toEqual(
        expect.arrayContaining(['id', 'email', 'displayName', 'role']),
      );
    });

    it('turns the unique-constraint race into a 409', async () => {
      prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        service.signUp({ email: 'a@b.co', displayName: 'learner', password }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not swallow unrelated database errors', async () => {
      prisma.user.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.signUp({ email: 'a@b.co', displayName: 'learner', password }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('validateCredentials', () => {
    it('accepts the right password', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash }));

      await expect(
        service.validateCredentials('learner@example.com', password),
      ).resolves.toMatchObject({ email: 'learner@example.com' });
    });

    it('rejects the wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash }));

      await expect(
        service.validateCredentials('learner@example.com', 'wrong'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // Same wording for both, or the response tells an attacker which emails
    // are registered.
    it('gives an unknown email the same message as a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash }));
      const wrongPassword = await service
        .validateCredentials('learner@example.com', 'wrong')
        .catch((error: Error) => error.message);

      prisma.user.findUnique.mockResolvedValue(null);
      const unknownEmail = await service
        .validateCredentials('nobody@example.com', password)
        .catch((error: Error) => error.message);

      expect(unknownEmail).toBe(wrongPassword);
    });

    it('matches the stored email case-insensitively', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash }));

      await service.validateCredentials('Learner@Example.com', password);

      expect(prisma.user.findUnique.mock.calls[0][0].where.email).toBe('learner@example.com');
    });
  });

  describe('findById', () => {
    it('returns null for a user that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('gone')).resolves.toBeNull();
    });
  });
});
