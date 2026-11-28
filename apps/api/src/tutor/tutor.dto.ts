import { createZodDto } from 'nestjs-zod';
import { TutorCheckSchema, TutorInfoSchema } from '@ft/shared';

// What goes out: only documents the answer in Swagger (/api/docs), as users.dto.ts does.
export class TutorInfoDto extends createZodDto(TutorInfoSchema) {}
export class TutorCheckDto extends createZodDto(TutorCheckSchema) {}
