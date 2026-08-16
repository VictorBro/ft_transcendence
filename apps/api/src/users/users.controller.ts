import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import type { SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { SessionUserDto, UpdateProfileDto } from '../auth/auth.dto';
import { UsersService } from './users.service';
import { AVATAR_STORAGE_DIR } from '../app.setup';

// Extension looked up here, never taken from the client's filename
// file.mimetype is attacker-controlled too, but at least
// it's checked against this whitelist before being trusted.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

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

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload your own avatar' })
  @ApiOkResponse({ type: SessionUserDto })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: AVATAR_STORAGE_DIR,
        filename: (req, file, callback) =>
          callback(null, `${randomUUID()}${EXTENSION_BY_MIME[file.mimetype]}`),
      }),
      limits: { fileSize: MAX_AVATAR_BYTES },
      fileFilter: (req, file, callback) => callback(null, file.mimetype in EXTENSION_BY_MIME),
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @CurrentUser() user: SessionUser,
  ): Promise<SessionUser> {
    if (!file) {
      throw new BadRequestException('Invalid file type or size');
    }
    const origin = `${req.protocol}://${req.get('host')}`;
    return this.users.updateProfile(user.id, {
      avatarUrl: `${origin}/api/uploads/avatars/${file.filename}`,
    });
  }
}
