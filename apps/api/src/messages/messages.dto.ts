import { createZodDto } from 'nestjs-zod';
import { ConversationsSchema, MessagePageQuerySchema, MessagePageSchema } from '@ft/shared';

// The search params (?cursor=…), checked before the controller gets them.
export class MessagePageQueryDto extends createZodDto(MessagePageQuerySchema) {}
// What goes out: these only document the answers in Swagger (/api/docs).
export class ConversationsDto extends createZodDto(ConversationsSchema) {}
export class MessagePageDto extends createZodDto(MessagePageSchema) {}
