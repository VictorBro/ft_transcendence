/** Browser half of the conversations API, like friends-client.ts. Every call names the other user. */
import { MessagePageSchema, type MessagePage } from '@ft/shared';

import { clientGet, type ApiResult } from '@/lib/api-client';

function messagesPath(userId: string): string {
  return `/api/conversations/${userId}/messages`;
}

/** What the thread catches up with after a connect. */
export function fetchNewestMessages(userId: string): Promise<ApiResult<MessagePage>> {
  return clientGet(MessagePageSchema, messagesPath(userId));
}

/** The page before `cursor`, a page's nextCursor. */
export function fetchEarlierMessages(
  userId: string,
  cursor: string,
): Promise<ApiResult<MessagePage>> {
  return clientGet(MessagePageSchema, messagesPath(userId), { cursor });
}
