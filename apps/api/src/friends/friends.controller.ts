import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FriendRequestResult, Friends, SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { UserIdParam } from '../validation.pipe';
import { FriendRequestResultDto, FriendsDto } from './friends.dto';
import { FriendsService } from './friends.service';

// The other user is always named in the path, never a row id.
@ApiTags('friends')
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  @ApiOperation({ summary: 'Your friends, and the requests waiting on either side' })
  @ApiOkResponse({ type: FriendsDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  list(@CurrentUser() user: SessionUser): Promise<Friends> {
    return this.friends.list(user.id);
  }

  // Tighter than the global 100: a declined request can be sent again at once,
  // and each send pushes an event and a refresh to the other person.
  @Post('requests/:userId')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a friend request, or accept theirs if it is already waiting' })
  @ApiCreatedResponse({ type: FriendRequestResultDto })
  @ApiBadRequestResponse({ description: 'friend.self, or not a user id' })
  @ApiNotFoundResponse({
    description:
      'user.notFound, or friend.requestNotFound if their request was cancelled while yours was being sent',
  })
  @ApiConflictResponse({ description: 'friend.alreadyRequested or friend.alreadyFriends' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  send(
    @Param('userId', UserIdParam) userId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<FriendRequestResult> {
    return this.friends.send(user.id, userId);
  }

  @Post('requests/:userId/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept their friend request' })
  @ApiNoContentResponse({ description: 'You are now friends' })
  @ApiNotFoundResponse({ description: 'friend.requestNotFound' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  accept(
    @Param('userId', UserIdParam) userId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.friends.accept(user.id, userId);
  }

  @Delete('requests/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Decline their request or cancel yours' })
  @ApiNoContentResponse({ description: 'The request is gone' })
  @ApiNotFoundResponse({ description: 'friend.requestNotFound' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  deleteRequest(
    @Param('userId', UserIdParam) userId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.friends.deleteRequest(user.id, userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a friend' })
  @ApiNoContentResponse({ description: 'You are no longer friends' })
  @ApiNotFoundResponse({ description: 'friend.notFound' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  remove(
    @Param('userId', UserIdParam) userId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.friends.remove(user.id, userId);
  }
}
