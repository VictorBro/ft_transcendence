import { describe, expect, it } from 'vitest';

import {
  CreateUserSchema,
  DEFAULT_LOCALE,
  DisableTwoFactorSchema,
  EnableTwoFactorSchema,
  HealthResponseSchema,
  HelloQuerySchema,
  HelloResponseSchema,
  LocaleSchema,
  LoginSchema,
  PublicUserSchema,
  SecondFactorSchema,
  SignUpFormSchema,
  SUPPORTED_LOCALES,
  UpdateProfileSchema,
  UserSchema,
  isErrorCode,
  isLocale,
} from './index';

const validUser = {
  id: '3f0f9d1e-8a2c-4f3b-9c1d-6d2c5b8a7e41',
  email: 'ada@example.com',
  displayName: 'ada_lovelace',
  avatarUrl: 'https://example.com/a.png',
  locale: 'fr',
  role: 'USER',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

describe('locale', () => {
  it('offers at least the three languages the i18n module requires', () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(3);
    expect(LocaleSchema.parse(DEFAULT_LOCALE)).toBe(DEFAULT_LOCALE);
  });

  it('narrows unknown values', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('klingon')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('HealthResponseSchema', () => {
  it('accepts a healthy payload and defaults the dependency list', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: '0.0.0',
      uptimeSeconds: 12.5,
      checkedAt: '2026-08-01T10:00:00.000Z',
    });

    expect(parsed.dependencies).toEqual([]);
  });

  it('accepts declared dependencies', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'degraded',
      service: 'api',
      version: '0.0.0',
      uptimeSeconds: 0,
      checkedAt: '2026-08-01T10:00:00.000Z',
      dependencies: [{ name: 'redis', status: 'down', latencyMs: 0 }],
    });

    expect(parsed.dependencies[0]?.name).toBe('redis');
  });

  it('rejects an unknown status and a negative uptime', () => {
    expect(
      HealthResponseSchema.safeParse({
        status: 'fine',
        service: 'api',
        version: '0.0.0',
        uptimeSeconds: 1,
        checkedAt: '2026-08-01T10:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      HealthResponseSchema.safeParse({
        status: 'ok',
        service: 'api',
        version: '0.0.0',
        uptimeSeconds: -1,
        checkedAt: '2026-08-01T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('hello', () => {
  it('fills the defaults the frontend and backend must agree on', () => {
    expect(HelloQuerySchema.parse({})).toEqual({ name: 'world', locale: DEFAULT_LOCALE });
  });

  it('trims the name before length checks', () => {
    expect(HelloQuerySchema.parse({ name: '  ada  ' }).name).toBe('ada');
    expect(HelloQuerySchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    expect(HelloQuerySchema.safeParse({ locale: 'es' }).success).toBe(false);
  });

  it('validates the response shape', () => {
    const parsed = HelloResponseSchema.parse({
      message: 'Bonjour, ada',
      locale: 'fr',
      generatedAt: '2026-08-01T10:00:00.000Z',
    });

    expect(parsed.locale).toBe('fr');
    expect(HelloResponseSchema.safeParse({ ...parsed, generatedAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('UserSchema', () => {
  it('accepts a well formed user', () => {
    expect(UserSchema.parse(validUser).displayName).toBe('ada_lovelace');
  });

  it('accepts a null avatar', () => {
    expect(UserSchema.parse({ ...validUser, avatarUrl: null }).avatarUrl).toBeNull();
  });

  it('rejects a bad id, email, display name and role', () => {
    expect(UserSchema.safeParse({ ...validUser, id: 'nope' }).success).toBe(false);
    expect(UserSchema.safeParse({ ...validUser, email: 'not-an-email' }).success).toBe(false);
    expect(UserSchema.safeParse({ ...validUser, displayName: 'a b' }).success).toBe(false);
    expect(UserSchema.safeParse({ ...validUser, role: 'ROOT' }).success).toBe(false);
  });

  it('keeps the email out of the public projection', () => {
    const publicUser = PublicUserSchema.parse(validUser);

    expect(publicUser).not.toHaveProperty('email');
    expect(Object.keys(publicUser).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'locale']);
  });
});

describe('CreateUserSchema', () => {
  const signup = {
    email: 'ada@example.com',
    displayName: 'ada_lovelace',
    password: 'correct-Horse1',
  };

  it('accepts a valid signup', () => {
    expect(CreateUserSchema.parse(signup).locale).toBeUndefined();
    expect(CreateUserSchema.parse({ ...signup, locale: 'de' }).locale).toBe('de');
  });

  it('reports every password rule it breaks', () => {
    const result = CreateUserSchema.safeParse({ ...signup, password: 'short' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThan(1);
  });

  it('rejects a long password without a digit', () => {
    expect(CreateUserSchema.safeParse({ ...signup, password: 'NoDigitsInHere' }).success).toBe(
      false,
    );
  });
});

describe('SignUpFormSchema', () => {
  const valid = {
    email: 'learner@example.com',
    displayName: 'learner',
    password: 'Correct-Horse-9',
    confirmPassword: 'Correct-Horse-9',
  };

  it('accepts a matching confirmation', () => {
    expect(SignUpFormSchema.safeParse(valid).success).toBe(true);
  });

  // The message has to land on the confirmation, not the password: blaming the
  // first field sends the user to correct the one they probably typed right.
  it('reports a mismatch against the confirmation field', () => {
    const result = SignUpFormSchema.safeParse({ ...valid, confirmPassword: 'Correct-Horse-8' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['confirmPassword']);
    expect(result.error?.issues[0].message).toBe('password.mismatch');
  });

  // The confirmation is a form concern; CreateUserSchema stays the wire contract.
  it('is not part of what the API accepts', () => {
    expect(Object.keys(CreateUserSchema.shape)).not.toContain('confirmPassword');
  });
});

/**
 * Half of the error contract: every message this package emits is an
 * ERROR_CODES entry rather than a sentence. The other half — that each code has
 * three translations — is asserted in apps/web/lib/messages.test.ts.
 *
 * The trap this exists for is Zod's own defaults: a rule declared without an
 * explicit message still produces an issue, in English, that no catalogue can
 * translate.
 */
describe('validation messages', () => {
  const rejected = [
    ['CreateUserSchema', CreateUserSchema, { email: 'nope', displayName: 'x', password: 'short' }],
    ['LoginSchema', LoginSchema, { email: 'nope', password: '' }],
    ['UpdateProfileSchema', UpdateProfileSchema, {}],
    ['UpdateProfileSchema avatar', UpdateProfileSchema, { avatarUrl: 'not a url' }],
    [
      'SignUpFormSchema',
      SignUpFormSchema,
      {
        email: 'learner@example.com',
        displayName: 'learner',
        password: 'Correct-Horse-9',
        confirmPassword: 'Different-Horse-9',
      },
    ],
    ['SecondFactorSchema', SecondFactorSchema, { code: 'neither' }],
    ['EnableTwoFactorSchema', EnableTwoFactorSchema, { code: '12' }],
    ['DisableTwoFactorSchema', DisableTwoFactorSchema, { password: '' }],
  ] as const;

  it.each(rejected)('%s reports codes, not prose', (_name, schema, input) => {
    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    for (const issue of result.error?.issues ?? []) {
      expect(isErrorCode(issue.message), `not a declared code: ${issue.message}`).toBe(true);
    }
  });
});
