import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Conversations, MessagePage, SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { UserIdParam } from '../validation.pipe';
import { ConversationsDto, MessagePageDto, MessagePageQueryDto } from './messages.dto';
import { MessagesService } from './messages.service';

// Reading only: messages are sent over the socket (dm:send), where the ack
// answers. The other user is named in the path, never a row id.
@ApiTags('messages')
@Controller('conversations')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Your conversations, most recent first, with their unread counts' })
  @ApiOkResponse({ type: ConversationsDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  list(@CurrentUser() user: SessionUser): Promise<Conversations> {
    return this.messages.conversations(user.id);
  }

  @Get(':userId/messages')
  @ApiOperation({
    summary: 'A page of your conversation with this user, oldest first',
    description: 'The newest page, or with ?cursor= the page before that message.',
  })
  @ApiOkResponse({ type: MessagePageDto })
  @ApiBadRequestResponse({
    description: 'Not a user id, or a cursor that is not a message of this conversation',
  })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  page(
    @Param('userId', UserIdParam) userId: string,
    @Query() query: MessagePageQueryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<MessagePage> {
    return this.messages.page(user.id, userId, query.cursor);
  }
}
