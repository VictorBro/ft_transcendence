import { z } from 'zod';

import { PublicUserSchema } from './user';

export const MESSAGE_MAX_LENGTH = 1000;
/** Messages per page of a conversation's history. */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * Trimmed first, so a message of spaces is empty. Postgres refuses a NUL in
 * text, so it is refused here rather than failing the insert. Error codes, see
 * ./errors.ts.
 */
export const MessageTextSchema = z
  .string('message.empty')
  .trim()
  .min(1, 'message.empty')
  .max(MESSAGE_MAX_LENGTH, 'message.tooLong')
  .refine((text) => !text.includes('\u0000'), 'request.invalid');

/** readAt stays on the server: nothing on the page shows it. */
export const MessageSchema = z.object({
  id: z.uuid(),
  senderId: z.uuid(),
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

/** One conversation in the list, named by the other user. `unread`: theirs you have not read. */
export const ConversationSchema = z.object({
  user: PublicUserSchema,
  lastMessageAt: z.iso.datetime(),
  unread: z.number().int().nonnegative(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** Most recent first. */
export const ConversationsSchema = z.object({
  conversations: z.array(ConversationSchema),
});
export type Conversations = z.infer<typeof ConversationsSchema>;

/**
 * One page of a conversation, oldest first. `nextCursor` asks for the page
 * before it, and is null once the first message is in.
 */
export const MessagePageSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.uuid().nullable(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const MessagePageQuerySchema = z.object({
  cursor: z.uuid().optional(),
});
export type MessagePageQuery = z.infer<typeof MessagePageQuerySchema>;
