import { CreateUserSchema, LoginSchema, SessionUserSchema } from '@ft/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * The Zod schemas in @ft/shared are the rules; these wrap them so Nest validates
 * requests with them and Swagger documents them. The browser imports the same
 * schemas, which is what keeps client and server validation identical.
 */
export class SignUpDto extends createZodDto(CreateUserSchema) {}
export class LoginDto extends createZodDto(LoginSchema) {}
export class SessionUserDto extends createZodDto(SessionUserSchema) {}
