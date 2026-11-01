import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  RecoveryCodes,
  SessionUser,
  TwoFactorRequired,
  TwoFactorSetup,
  TwoFactorStatus,
} from '@ft/shared';
import type { Request, Response } from 'express';

import { SocketsService } from '../gateway/sockets.service';
import { ThrottleByIp } from '../throttler/throttle-by-ip.decorator';
import { CurrentUser, Public } from './auth.decorators';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  LoginDto,
  RecoveryCodesDto,
  SecondFactorDto,
  SessionUserDto,
  SignUpDto,
  TwoFactorRequiredDto,
  TwoFactorSetupDto,
  TwoFactorStatusDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

/**
 * A fresh session id on every login, and again whenever privileges change.
 * Without it, an id planted before login stays valid afterwards, which is
 * session fixation. The pending step regenerates too, so the id that carried an
 * unauthenticated visitor is not the one that carries a half-finished login.
 * Resolves with the id it replaced, whose sockets the caller closes.
 */
function regenerate(request: Request, assign: () => void): Promise<string> {
  const replaced = request.sessionID;
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      assign();
      request.session.save((saveError) => {
        if (saveError) {
          reject(saveError instanceof Error ? saveError : new Error(String(saveError)));
          return;
        }
        resolve(replaced);
      });
    });
  });
}

function startSession(request: Request, userId: string): Promise<string> {
  return regenerate(request, () => {
    request.session.userId = userId;
    delete request.session.pendingUserId;
  });
}

function startPendingSession(request: Request, userId: string): Promise<string> {
  return regenerate(request, () => {
    request.session.pendingUserId = userId;
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly sockets: SocketsService,
  ) {}

  @Public()
  @Post('signup')
  // Ten per minute per IP. Signup writes a row and runs argon2, so it is both
  // the most expensive unauthenticated endpoint and the one worth flooding.
  // The browser suite needs more accounts than this in a run and queues its
  // signups to fit (e2e/support/signup-budget.ts): it is the test traffic that
  // bends to this number, never the other way round.
  @ThrottleByIp(10)
  @ApiOperation({ summary: 'Create an account and sign in', security: [] })
  @ApiCreatedResponse({ type: SessionUserDto })
  @ApiConflictResponse({ description: 'Email or display name already taken' })
  async signUp(@Body() body: SignUpDto, @Req() request: Request): Promise<SessionUser> {
    const user = await this.auth.signUp(body);
    this.sockets.closeSession(await startSession(request, user.id));
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Tighter than signup: this is the endpoint a password guesser hammers.
  @ThrottleByIp(5)
  @ApiOperation({ summary: 'Sign in with email and password', security: [] })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    type: TwoFactorRequiredDto,
    description: 'Credentials accepted, a second factor is required',
  })
  @ApiUnauthorizedResponse({ description: 'Incorrect email or password' })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser | TwoFactorRequired> {
    const { user, twoFactorEnabled } = await this.auth.validateCredentials(
      body.email,
      body.password,
    );

    if (twoFactorEnabled) {
      this.sockets.closeSession(await startPendingSession(request, user.id));
      // 202 rather than 200: the credentials were accepted, the login is not
      // finished, and the body carries no user for a caller to mistake for one.
      response.status(HttpStatus.ACCEPTED);
      return { twoFactorRequired: true };
    }

    this.sockets.closeSession(await startSession(request, user.id));
    return user;
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  // As tight as login: this is the second half of the same guessing attempt,
  // and six digits is a far smaller space than a password.
  @ThrottleByIp(5)
  @ApiOperation({ summary: 'Complete a login with a second factor', security: [] })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'No pending login, or the code is wrong' })
  async verifySecondFactor(
    @Body() body: SecondFactorDto,
    @Req() request: Request,
  ): Promise<SessionUser> {
    const pendingUserId = request.session.pendingUserId;
    if (pendingUserId === undefined) {
      throw new UnauthorizedException('auth.passwordFirst');
    }

    if (!(await this.twoFactor.verifySecondFactor(pendingUserId, body.code))) {
      throw new UnauthorizedException('twoFactor.invalidCode');
    }

    const user = await this.auth.findById(pendingUserId);
    if (user === null) {
      throw new UnauthorizedException('auth.passwordFirst');
    }

    this.sockets.closeSession(await startSession(request, user.id));
    return user;
  }

  @Get('2fa')
  @ApiOperation({ summary: 'Whether this account has a second factor' })
  @ApiOkResponse({ type: TwoFactorStatusDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  twoFactorStatus(@CurrentUser() user: SessionUser): Promise<TwoFactorStatus> {
    return this.twoFactor.status(user.id);
  }

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin enrolment and return the QR to scan' })
  @ApiOkResponse({ type: TwoFactorSetupDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  setUpTwoFactor(@CurrentUser() user: SessionUser): Promise<TwoFactorSetup> {
    return this.twoFactor.beginEnrolment(user.id, user.email);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  // Behind a session, but still a secret check: a stolen cookie must not turn
  // into a code-guessing oracle, and six digits is a small space.
  @ThrottleByIp(5)
  @ApiOperation({ summary: 'Confirm enrolment and return the recovery codes' })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @ApiUnauthorizedResponse({ description: 'No valid session, or that code is not valid' })
  async enableTwoFactor(
    @Body() body: EnableTwoFactorDto,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<RecoveryCodes> {
    const recoveryCodes = await this.twoFactor.confirmEnrolment(user.id, body.code);
    await this.rotateSession(request, user.id);
    return { recoveryCodes };
  }

  @Delete('2fa')
  @HttpCode(HttpStatus.NO_CONTENT)
  // The password check below is what makes this worth guessing against, so it
  // is counted per address like login rather than per account.
  @ThrottleByIp(5)
  @ApiOperation({ summary: 'Turn off two factor authentication' })
  @ApiNoContentResponse({ description: 'Two factor authentication is off' })
  @ApiUnauthorizedResponse({ description: 'No valid session, or the password is incorrect' })
  async disableTwoFactor(
    @Body() body: DisableTwoFactorDto,
    @CurrentUser() user: SessionUser,
    @Req() request: Request,
  ): Promise<void> {
    // The password again, not just the session: an unattended browser should not
    // be enough to remove a factor.
    if (!(await this.auth.verifyPassword(user.id, body.password))) {
      throw new UnauthorizedException('auth.incorrectPassword');
    }
    await this.twoFactor.disable(user.id);
    await this.rotateSession(request, user.id);
  }

  // Public so that logging out of an expired session is not itself a 401.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Destroy the current session', security: [] })
  @ApiNoContentResponse({ description: 'Signed out, whether or not there was a session' })
  async logout(@Req() request: Request): Promise<void> {
    const ended = request.sessionID;
    // Failing loudly rather than returning 204: if the store entry survives, the
    // session is still usable and reporting success would be a lie.
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        resolve();
      });
    });
    // After the DEL, so a new handshake finds the session gone. One already past
    // express-session can still join; the gateway's sweep closes it within a minute.
    this.sockets.closeSession(ended);
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

  /**
   * Privileges changed: a fresh id, and the old id's sockets go with it. Logged,
   * not thrown: the change is already committed, and the codes must reach the user.
   */
  private async rotateSession(request: Request, userId: string): Promise<void> {
    try {
      this.sockets.closeSession(await startSession(request, userId));
    } catch (error) {
      this.logger.warn(`session not rotated: ${String(error)}`);
    }
  }
}
