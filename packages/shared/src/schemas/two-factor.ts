import { z } from 'zod';

/** Authenticator codes are always six digits; the string keeps leading zeros. */
export const TotpCodeSchema = z.string().regex(/^\d{6}$/, 'twoFactor.codeFormat');

/**
 * Recovery codes are printed in groups for readability, so the separator is
 * stripped before validation and the user may type them either way.
 */
export const RECOVERY_CODE_GROUPS = 4;
export const RECOVERY_CODE_GROUP_LENGTH = 5;
export const RECOVERY_CODE_COUNT = 10;

export const RecoveryCodeSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, '').toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        new RegExp(`^[a-z0-9]{${RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH}}$`),
        'twoFactor.recoveryCodeFormat',
      ),
  );

/**
 * Either factor satisfies the second step, so the login form accepts both.
 *
 * The union carries its own code: a failing union reports Zod's own
 * "Invalid input" rather than the message of either branch, and that default is
 * English no matter which language the page is in.
 */
export const SecondFactorSchema = z.object({
  code: z.union([TotpCodeSchema, RecoveryCodeSchema], 'twoFactor.secondFactorFormat'),
});
export type SecondFactorInput = z.infer<typeof SecondFactorSchema>;

export const EnableTwoFactorSchema = z.object({ code: TotpCodeSchema });
export type EnableTwoFactorInput = z.infer<typeof EnableTwoFactorSchema>;

/** Disabling is a privilege change, so it costs the password again. */
export const DisableTwoFactorSchema = z.object({
  password: z.string().min(1, 'password.required').max(128, 'password.tooLong'),
});
export type DisableTwoFactorInput = z.infer<typeof DisableTwoFactorSchema>;

/**
 * The QR image is rendered server side and returned as a data URL, so the
 * browser needs no QR library and the secret reaches the page exactly once.
 */
export const TwoFactorSetupSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  qrDataUrl: z.string(),
});
export type TwoFactorSetup = z.infer<typeof TwoFactorSetupSchema>;

/** Shown once at enrolment; the server keeps only digests afterwards. */
export const RecoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof RecoveryCodesSchema>;

/** What GET /auth/2fa reports about the signed-in account. */
export const TwoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  enrolmentPending: z.boolean(),
  recoveryCodesRemaining: z.number().int().min(0),
});
export type TwoFactorStatus = z.infer<typeof TwoFactorStatusSchema>;

/** The 202 body from POST /auth/login when the account has a second factor. */
export const TwoFactorRequiredSchema = z.object({ twoFactorRequired: z.literal(true) });
export type TwoFactorRequired = z.infer<typeof TwoFactorRequiredSchema>;
