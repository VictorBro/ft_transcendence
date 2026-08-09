import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
    user: { update: vi.fn(), findUnique: vi.fn() },
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
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const setup = await service.beginEnrolment('u1', EMAIL);

      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.otpauthUri).toContain('otpauth://totp/');
      expect(setup.qrDataUrl).toMatch(/^data:image\/gif;base64,/);
      // The account keeps working with one factor until a code is proven.
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { totpSecret: setup.secret, totpEnabledAt: null } }),
      );
    });

    it('refuses to confirm before setup has run', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: null,
      } as never);

      await expect(service.confirmEnrolment('u1', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a wrong code and leaves the factor off', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: new OTPAuth.Secret({ size: 20 }).base32,
      } as never);

      await expect(service.confirmEnrolment('u1', '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('enables the factor and issues recovery codes for a real code', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: EMAIL,
        totpSecret: secret,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const codes = await service.confirmEnrolment('u1', currentCode(secret));

      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      expect(codes[0]).toMatch(/^[a-z0-9]{5}(-[a-z0-9]{5}){3}$/);
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
