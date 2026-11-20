/** Server half of the conversations API, like friends.ts. */
import {
  ConversationsSchema,
  MessagePageSchema,
  type Conversation,
  type MessagePage,
} from '@ft/shared';

import { apiGet, settle } from './api';

/** /chat's list: the conversations, or /login for a signed-out visitor (see settle). */
export async function requireConversations(): Promise<Conversation[]> {
  return settle(await apiGet(ConversationsSchema, '/api/conversations'), 'conversations')
    .conversations;
}

/** The newest page of a conversation, for the thread's first paint. Only called with a valid id. */
export async function loadMessagePage(userId: string): Promise<MessagePage> {
  return settle(
    await apiGet(MessagePageSchema, `/api/conversations/${userId}/messages`),
    'messages',
  );
}
