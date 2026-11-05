import { createZodDto } from 'nestjs-zod';
import { UserSearchQuerySchema, UserSearchResultSchema } from '@ft/shared';

// The search params (?q=…), checked like a display name before the controller gets them.
export class UserSearchQueryDto extends createZodDto(UserSearchQuerySchema) {}
// What goes out: only documents the answer in Swagger (/api/docs).
export class UserSearchResultDto extends createZodDto(UserSearchResultSchema) {}
