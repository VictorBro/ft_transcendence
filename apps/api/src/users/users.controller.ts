import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  HttpStatus,
  Patch,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { open, unlink } from 'fs/promises';
import { MAX_AVATAR_BYTES } from '@ft/shared';
import type { SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { SessionUserDto, UpdateProfileDto } from '../auth/auth.dto';
import { UsersService } from './users.service';
import { AVATAR_STORAGE_DIR } from '../app.setup';

// One entry per accepted type: the extension is taken from here rather than from
// the client's filename, and `matchesHead` is the bytes the format really starts
// with, so nothing renamed can be stored and served back as an image.
const AVATAR_TYPES: Record<string, { extension: string; matchesHead: (head: Buffer) => boolean }> =
  {
    'image/png': {
      extension: '.png',
      matchesHead: (head) => head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    },
    'image/jpeg': {
      extension: '.jpg',
      matchesHead: (head) => head.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
    },
    'image/webp': {
      extension: '.webp',
      matchesHead: (head) =>
        head.subarray(0, 4).toString('ascii') === 'RIFF' &&
        head.subarray(8, 12).toString('ascii') === 'WEBP',
    },
  };
const HEAD_BYTES = 12;

async function looksLikeItsMimeType(path: string, mimetype: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0);
    return bytesRead === HEAD_BYTES && (AVATAR_TYPES[mimetype]?.matchesHead(head) ?? false);
  } finally {
    await handle.close();
  }
}

// Multer rejects an oversized file before the handler and Nest answers with the
// sentence "File too large". Every other error here is a code the browser
// translates, so map it onto one.
@Catch(PayloadTooLargeException)
class AvatarTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ statusCode: HttpStatus.PAYLOAD_TOO_LARGE, message: 'avatar.invalidFile' });
  }
}

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
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  updateProfile(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user: SessionUser,
  ): Promise<SessionUser> {
    return this.users.updateProfile(user.id, body);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload your own avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiPayloadTooLargeResponse({ description: 'avatar.invalidFile' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: AVATAR_STORAGE_DIR,
        filename: (_req, file, callback) =>
          callback(null, `${randomUUID()}${AVATAR_TYPES[file.mimetype].extension}`),
      }),
      limits: { fileSize: MAX_AVATAR_BYTES },
      // A rejected type is dropped silently, so the `!file` guard answers for it.
      fileFilter: (_req, file, callback) => callback(null, file.mimetype in AVATAR_TYPES),
    }),
  )
  @UseFilters(AvatarTooLargeFilter)
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: SessionUser,
  ): Promise<SessionUser> {
    if (!file) {
      throw new BadRequestException('avatar.invalidFile');
    }

    if (!(await looksLikeItsMimeType(file.path, file.mimetype))) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('avatar.invalidFile');
    }

    return this.users.setAvatar(user.id, file.filename);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove your own avatar and fall back to the default' })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  removeAvatar(@CurrentUser() user: SessionUser): Promise<SessionUser> {
    return this.users.clearAvatar(user.id);
  }
}
