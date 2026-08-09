import {
  CreateUserSchema,
  DisableTwoFactorSchema,
  EnableTwoFactorSchema,
  LoginSchema,
  RecoveryCodesSchema,
  SecondFactorSchema,
  SessionUserSchema,
  TwoFactorSetupSchema,
  TwoFactorStatusSchema,
  UpdateProfileSchema,
} from '@ft/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * The Zod schemas in @ft/shared are the rules; these wrap them so Nest validates
 * requests with them and Swagger documents them. The browser imports the same
 * schemas, which is what keeps client and server validation identical.
 */
export class SignUpDto extends createZodDto(CreateUserSchema) {}
export class LoginDto extends createZodDto(LoginSchema) {}
export class SessionUserDto extends createZodDto(SessionUserSchema) {}
export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}

export class SecondFactorDto extends createZodDto(SecondFactorSchema) {}
export class EnableTwoFactorDto extends createZodDto(EnableTwoFactorSchema) {}
export class DisableTwoFactorDto extends createZodDto(DisableTwoFactorSchema) {}
export class TwoFactorSetupDto extends createZodDto(TwoFactorSetupSchema) {}
export class TwoFactorStatusDto extends createZodDto(TwoFactorStatusSchema) {}
export class RecoveryCodesDto extends createZodDto(RecoveryCodesSchema) {}
