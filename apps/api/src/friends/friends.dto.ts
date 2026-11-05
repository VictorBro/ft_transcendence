import { createZodDto } from 'nestjs-zod';
import { FriendRequestResultSchema, FriendsSchema } from '@ft/shared';

// What goes out: these only document the answers in Swagger (/api/docs).
export class FriendsDto extends createZodDto(FriendsSchema) {}
export class FriendRequestResultDto extends createZodDto(FriendRequestResultSchema) {}
