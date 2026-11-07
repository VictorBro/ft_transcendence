import { z } from 'zod';

import { CourseSchema } from './course';
import { LanguageSchema } from './language';
import { LocaleSchema } from './locale';

export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserIdSchema = z.uuid();

/**
 * Every message here is an ERROR_CODES entry rather than a sentence: the API
 * returns these verbatim and the browser renders them in the reader's language.
 * See ./errors.ts.
 */
export const DisplayNameSchema = z
  .string('displayName.tooShort')
  .min(3, 'displayName.tooShort')
  .max(32, 'displayName.tooLong')
  .regex(/^[\p{L}\p{N}._-]+$/u, 'displayName.invalidCharacters');

/**
 * An IANA zone as the browser reports it. Validity is whatever Intl accepts:
 * Intl.supportedValuesOf('timeZone') would be shorter, but on Node 24 it lists
 * neither UTC (the column default) nor Europe/Kyiv.
 */
export const TimeZoneSchema = z
  .string('profile.invalidTimeZone')
  // Aborts, so a long value neither reaches Intl nor reports the code twice.
  .max(64, { error: 'profile.invalidTimeZone', abort: true })
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone });
      return true;
    } catch {
      return false;
    }
  }, 'profile.invalidTimeZone');

/**
 * Enforced identically by the signup form and by the API. argon2 hashes whatever
 * it is given, so length is the only defence that matters here.
 */
export const PasswordSchema = z
  .string('password.required')
  .min(12, 'password.tooShort')
  .max(128, 'password.tooLong')
  .regex(/[a-z]/, 'password.needsLowercase')
  .regex(/[A-Z]/, 'password.needsUppercase')
  .regex(/\d/, 'password.needsDigit');

/**
 * Mirrors the Prisma `User` model in apps/api. Two rules keep them in sync:
 * timestamps cross the wire as ISO strings (the API serialises the Date columns),
 * and `passwordHash` is never part of any schema in this package.
 */
export const UserSchema = z.object({
  id: UserIdSchema,
  email: z.email('email.invalid'),
  displayName: DisplayNameSchema,
  // A path, not an absolute url, so z.url() would reject every real value.
  avatarUrl: z.string().nullable(),
  locale: LocaleSchema,
  // Checked on write only: a zone the API accepted may be newer than the ICU of
  // whoever reads the session, and failing that parse would break login.
  timeZone: z.string(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

/** What other users are allowed to see: what /privacy says they see. Email stays server side. */
export const PublicUserSchema = UserSchema.pick({
  id: true,
  displayName: true,
  avatarUrl: true,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** Enough to find someone by part of a name, too few to page through everyone at once. */
export const USER_SEARCH_LIMIT = 20;

/**
 * Checked like a display name: the shortest name is the shortest query, so a
 * full name always finds its person, and the codes are the name's own.
 */
export const UserSearchQuerySchema = z.object({
  q: z.string('displayName.tooShort').trim().pipe(DisplayNameSchema),
});
export type UserSearchQuery = z.infer<typeof UserSearchQuerySchema>;

export const UserSearchResultSchema = z.object({ users: z.array(PublicUserSchema) });
export type UserSearchResult = z.infer<typeof UserSearchResultSchema>;

/** One course as other users see it. #95 adds xp and achievements here. */
export const PublicCourseSchema = CourseSchema.pick({ lang: true, level: true }).extend({
  /** As the owner's course page shows it: 0 once a day passes without the goal. */
  streak: z.number().int().min(0),
});
export type PublicCourse = z.infer<typeof PublicCourseSchema>;

/** GET /api/users/:id. Where you stand with them comes from GET /api/friends. */
export const PublicProfileSchema = PublicUserSchema.extend({
  courses: z.array(PublicCourseSchema),
});
export type PublicProfile = z.infer<typeof PublicProfileSchema>;

/** A list to glance at, not to page through. */
export const RECENTLY_ACTIVE_LIMIT = 20;

/** Someone to add. No day either: the list is by name. */
export const RecentlyActiveUserSchema = PublicUserSchema.extend({
  languages: z.array(LanguageSchema),
});
export type RecentlyActiveUser = z.infer<typeof RecentlyActiveUserSchema>;

export const RecentlyActiveSchema = z.object({ users: z.array(RecentlyActiveUserSchema) });
export type RecentlyActive = z.infer<typeof RecentlyActiveSchema>;

export const CreateUserSchema = z.object({
  email: z.email('email.invalid'),
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
  message: 'password.mismatch',
  path: ['confirmPassword'],
});
export type SignUpFormInput = z.infer<typeof SignUpFormSchema>;

/**
 * Login deliberately does not reuse PasswordSchema. Its rules describe what a
 * NEW password must contain, and applying them here would reject an older
 * account's valid password with a message that reads like a policy complaint.
 */
export const LoginSchema = z.object({
  email: z.email('email.invalid'),
  password: z.string('password.required').min(1, 'password.required').max(128, 'password.tooLong'),
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
 *
 * `avatarUrl` is absent because it names a file on our disk: a caller who could
 * set it could name someone else's file and have us delete it.
 */
export const UpdateProfileSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    locale: LocaleSchema.optional(),
    timeZone: TimeZoneSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'profile.noChanges');
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Shared so the browser refuses early and the server refuses again. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
