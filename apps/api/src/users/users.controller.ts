import { Body, Controller, Patch } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { SessionUserDto, UpdateProfileDto } from '../auth/auth.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // No :id variant: editing someone else's profile is the advanced permissions
  // module, and an id in the path invites forgetting to check it.
  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile' })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiConflictResponse({ description: 'Display name already taken' })
  updateProfile(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user: SessionUser,
  ): Promise<SessionUser> {
    return this.users.updateProfile(user.id, body);
  }
}
