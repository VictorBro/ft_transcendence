import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { SessionUser } from '@ft/shared';
import type { Request } from 'express';

import { CurrentUser, Public } from './auth.decorators';
import { LoginDto, SessionUserDto, SignUpDto } from './auth.dto';
import { AuthService } from './auth.service';

/**
 * A fresh session id on every login, and again whenever privileges change.
 * Without it, an id planted before login stays valid afterwards, which is
 * session fixation.
 */
function startSession(request: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      request.session.userId = userId;
      request.session.save((saveError) => {
        if (saveError) {
          reject(saveError instanceof Error ? saveError : new Error(String(saveError)));
          return;
        }
        resolve();
      });
    });
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  // Ten per minute per IP. Signup writes a row and runs argon2, so it is both
  // the most expensive unauthenticated endpoint and the one worth flooding.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and sign in' })
  @ApiCreatedResponse({ type: SessionUserDto })
  @ApiConflictResponse({ description: 'Email or display name already taken' })
  async signUp(@Body() body: SignUpDto, @Req() request: Request): Promise<SessionUser> {
    const user = await this.auth.signUp(body);
    await startSession(request, user.id);
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Tighter than signup: this is the endpoint a password guesser hammers.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'Incorrect email or password' })
  async login(@Body() body: LoginDto, @Req() request: Request): Promise<SessionUser> {
    const user = await this.auth.validateCredentials(body.email, body.password);
    await startSession(request, user.id);
    return user;
  }

  // Public so that logging out of an expired session is not itself a 401.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Destroy the current session' })
  async logout(@Req() request: Request): Promise<void> {
    await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
    // The store entry is gone; this clears the now-dangling browser cookie.
    request.res?.clearCookie('ft.sid', { path: '/' });
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
