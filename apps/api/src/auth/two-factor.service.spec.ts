import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from './two-factor.service';

const EMAIL = 'learner@example.com';

function currentCode(secret: string): string {
  return new OTPAuth.TOTP({
    issuer: 'ft_transcendence',
    label: EMAIL,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate();
}

describe('TwoFactorService', () => {
  const prisma = {
    user: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    recoveryCode: { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as PrismaService;
  let service: TwoFactorService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
    service = new TwoFactorService(prisma);
  });

  describe('enrolment', () => {
    it('stores a secret without enabling anything', async () => {
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);

      const setup = await service.beginEnrolment('u1', EMAIL);

      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.otpauthUri).toContain('otpauth://totp/');
      expect(setup.qrDataUrl).toMatch(/^data:image\/gif;base64,/);
      // Only on an account whose 2FA is off, checked in the same statement.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', totpEnabledAt: null },
        data: { totpSecret: setup.secret },
      });
    });

    it('refuses setup once 2FA is on, and returns no secret (#216)', async () => {
      // The WHERE matched nothing: totpEnabledAt is set.
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.beginEnrolment('u1', EMAIL)).rejects.toMatchObject({
        constructor: ConflictException,
        message: 'twoFactor.alreadyEnabled',
      });
    });

    it('refuses to confirm before setup has run', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: null,
        totpEnabledAt: null,
      } as never);

      await expect(service.confirmEnrolment('u1', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to confirm once 2FA is on, and keeps the recovery codes (#216)', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: secret,
        totpEnabledAt: new Date(),
      } as never);

      // Even with a real code: the codes must not be replaced on a session alone.
      await expect(service.confirmEnrolment('u1', currentCode(secret))).rejects.toMatchObject({
        constructor: ConflictException,
        message: 'twoFactor.alreadyEnabled',
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a wrong code and leaves the factor off', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: new OTPAuth.Secret({ size: 20 }).base32,
        totpEnabledAt: null,
      } as never);

      await expect(service.confirmEnrolment('u1', '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('enables the secret the code was checked against, and issues recovery codes', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: secret,
        totpEnabledAt: null,
      } as never);
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);

      const codes = await service.confirmEnrolment('u1', currentCode(secret));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', totpSecret: secret, totpEnabledAt: null },
        data: { totpEnabledAt: expect.any(Date) as Date },
      });
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      expect(codes[0]).toMatch(/^[a-z0-9]{5}(-[a-z0-9]{5}){3}$/);
    });

    it('turns nothing on when another setup replaced the secret after the check', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ email: EMAIL, totpSecret: secret, totpEnabledAt: null } as never)
        .mockResolvedValueOnce({ totpEnabledAt: null } as never);
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.confirmEnrolment('u1', currentCode(secret))).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'twoFactor.setupFirst',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('issues one set of codes when two confirmations race', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ email: EMAIL, totpSecret: secret, totpEnabledAt: null } as never)
        .mockResolvedValueOnce({ totpEnabledAt: new Date() } as never);
      // The other request turned it on first.
      vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.confirmEnrolment('u1', currentCode(secret))).rejects.toMatchObject({
        constructor: ConflictException,
        message: 'twoFactor.alreadyEnabled',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('second factor', () => {
    it('accepts the current authenticator code', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: secret,
        totpEnabledAt: new Date(),
      } as never);

      await expect(service.verifySecondFactor('u1', currentCode(secret))).resolves.toBe(true);
    });

    // Without this check a secret left over from an abandoned enrolment would
    // satisfy a login that was never meant to need one.
    it('refuses a code when the factor was never enabled', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: secret,
        totpEnabledAt: null,
      } as never);

      await expect(service.verifySecondFactor('u1', currentCode(secret))).resolves.toBe(false);
    });

    it('falls back to a recovery code, hyphenated or not', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: new OTPAuth.Secret({ size: 20 }).base32,
        totpEnabledAt: new Date(),
      } as never);
      vi.mocked(prisma.recoveryCode.updateMany).mockResolvedValue({ count: 1 } as never);

      await expect(service.verifySecondFactor('u1', 'ABCDE-FGHIJ-KLMNO-PQRST')).resolves.toBe(true);
      expect(prisma.recoveryCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usedAt: null }) }),
      );
    });

    // The match and the write are one statement, so two logins cannot both
    // spend the same code.
    it('reports a recovery code that was already spent', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: new OTPAuth.Secret({ size: 20 }).base32,
        totpEnabledAt: new Date(),
      } as never);
      vi.mocked(prisma.recoveryCode.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.verifySecondFactor('u1', 'abcde-fghij-klmno-pqrst')).resolves.toBe(
        false,
      );
    });
  });
});
