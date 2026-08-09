import { z } from 'zod';

import { LocaleSchema } from './locale';

export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserIdSchema = z.uuid();

export const DisplayNameSchema = z
  .string()
  .min(3, 'Display name needs at least 3 characters')
  .max(32, 'Display name is limited to 32 characters')
  .regex(/^[\p{L}\p{N}._-]+$/u, 'Display name allows letters, digits, dot, underscore and hyphen');

/**
 * Enforced identically by the signup form and by the API. argon2 hashes whatever
 * it is given, so length is the only defence that matters here.
 */
export const PasswordSchema = z
  .string()
  .min(12, 'Password needs at least 12 characters')
  .max(128, 'Password is limited to 128 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a digit');

/**
 * Mirrors the Prisma `User` model in apps/api. Two rules keep them in sync:
 * timestamps cross the wire as ISO strings (the API serialises the Date columns),
 * and `passwordHash` is never part of any schema in this package.
 */
export const UserSchema = z.object({
  id: UserIdSchema,
  email: z.email(),
  displayName: DisplayNameSchema,
  avatarUrl: z.url().nullable(),
  locale: LocaleSchema,
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

/** What other users are allowed to see. Email stays server side. */
export const PublicUserSchema = UserSchema.pick({
  id: true,
  displayName: true,
  avatarUrl: true,
  locale: true,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const CreateUserSchema = z.object({
  email: z.email(),
  displayName: DisplayNameSchema,
  password: PasswordSchema,
  locale: LocaleSchema.optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * What the signup form validates, which is more than the API accepts: the
 * confirmation never crosses the wire, because the server has nothing to do
 * with it. It exists because there is no password reset, so a typo here would
 * lock someone out of an account nobody can recover.
 */
export const SignUpFormSchema = CreateUserSchema.extend({
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: 'The two passwords do not match',
  path: ['confirmPassword'],
});
export type SignUpFormInput = z.infer<typeof SignUpFormSchema>;

/**
 * Login deliberately does not reuse PasswordSchema. Its rules describe what a
 * NEW password must contain, and applying them here would reject an older
 * account's valid password with a message that reads like a policy complaint.
 */
export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** The signed-in user's own record: email included, passwordHash never. */
export const SessionUserSchema = UserSchema.omit({ updatedAt: true });
export type SessionUser = z.infer<typeof SessionUserSchema>;

/**
 * Every field optional so a form can send only what changed, but at least one
 * must be present: an empty body would otherwise report success while doing
 * nothing. Email and role are absent by design, since changing either is a
 * privilege change rather than a profile edit.
 */
export const UpdateProfileSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    locale: LocaleSchema.optional(),
    avatarUrl: z.url().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field');
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
