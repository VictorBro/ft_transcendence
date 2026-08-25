import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_GROUPS,
  RECOVERY_CODE_GROUP_LENGTH,
  type TwoFactorStatus,
} from '@ft/shared';
import * as OTPAuth from 'otpauth';
import qrcode from 'qrcode-generator';

import { PrismaService } from '../prisma/prisma.service';

const ISSUER = 'ft_transcendence';

/**
 * One step either side of the current one, so a code typed as the interval
 * rolls over is still accepted. Wider windows extend the replay window for a
 * code an attacker has already observed.
 */
const VALIDATION_WINDOW = 1;

/** Excludes look-alike characters, because these get copied off a screen by hand. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function totpFor(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Recovery codes are high-entropy random, so a plain digest is enough and lets a
 * login find one by indexed lookup. Passwords need argon2 precisely because they
 * are not random; these are.
 */
function digest(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateRecoveryCode(): string {
  const length = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH;
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return code;
}

/** Grouped with hyphens for transcription; the schema strips them again. */
function formatRecoveryCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += RECOVERY_CODE_GROUP_LENGTH) {
    groups.push(code.slice(i, i + RECOVERY_CODE_GROUP_LENGTH));
  }
  return groups.join('-');
}

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes a secret without enabling anything. The account keeps working with
   * one factor until a code proves the authenticator was actually configured.
   */
  async beginEnrolment(userId: string, email: string) {
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabledAt: null },
    });

    const otpauthUri = totpFor(secret, email).toString();
    return { secret, otpauthUri, qrDataUrl: this.qrDataUrl(otpauthUri) };
  }

  private qrDataUrl(text: string): string {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 8);
  }

  private verifyCode(secret: string, email: string, code: string): boolean {
    // Returns the clock delta on success and null on failure.
    return totpFor(secret, email).validate({ token: code, window: VALIDATION_WINDOW }) !== null;
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    return {
      enabled: user?.totpEnabledAt != null,
      enrolmentPending: user?.totpSecret != null && user.totpEnabledAt === null,
      recoveryCodesRemaining: await this.countUnusedRecoveryCodes(userId),
    };
  }

  /**
   * Proving the authenticator works before it becomes required, so a mistyped
   * secret cannot lock the account out. Returns the recovery codes, which the
   * caller shows exactly once.
   */
  async confirmEnrolment(userId: string, code: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, totpSecret: true },
    });
    if (user?.totpSecret == null) {
      throw new BadRequestException('twoFactor.setupFirst');
    }
    if (!this.verifyCode(user.totpSecret, user.email, code)) {
      throw new UnauthorizedException('twoFactor.invalidCode');
    }

    await this.enable(userId);
    return this.issueRecoveryCodes(userId);
  }

  /** Accepts either factor, so a lost authenticator is not a lost account. */
  async verifySecondFactor(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, totpSecret: true, totpEnabledAt: true },
    });
    if (user?.totpSecret == null || user.totpEnabledAt === null) {
      return false;
    }

    if (/^\d{6}$/.test(code) && this.verifyCode(user.totpSecret, user.email, code)) {
      return true;
    }
    return this.consumeRecoveryCode(userId, code.replace(/[\s-]/g, '').toLowerCase());
  }

  /**
   * Replaces any previous set: reissuing invalidates codes a user may have lost
   * track of, which is the point of regenerating them.
   */
  async issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((code) => ({ userId, codeHash: digest(code) })),
      }),
    ]);
    return codes.map(formatRecoveryCode);
  }

  /**
   * Single use: the row is consumed in the same statement that matches it, so
   * two concurrent logins cannot both spend one code.
   */
  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: digest(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count > 0;
  }

  countUnusedRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  async enable(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date() },
    });
  }

  /** Clearing the secret as well, so re-enabling always starts a fresh enrolment. */
  async disable(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabledAt: null },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
  }
}
