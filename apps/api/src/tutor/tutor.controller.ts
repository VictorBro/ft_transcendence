import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { TutorCheck, TutorInfo } from '@ft/shared';

import { TutorCheckDto, TutorInfoDto } from './tutor.dto';
import { TutorService } from './tutor.service';

/** How many key checks one account may ask for in a minute. */
export const TUTOR_CHECKS_PER_MINUTE = 3;

// "tutor", the word every llm.* error sentence uses; "llm" stays internal.
// Both routes need a session (the global AuthGuard): no visitor can make the api call Google.
@ApiTags('tutor')
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  @Get()
  @ApiOperation({ summary: 'The LLM provider and model the lesson tutor runs on. Never the key' })
  @ApiOkResponse({ type: TutorInfoDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  info(): TutorInfo {
    return this.tutor.info();
  }

  // POST, not GET: it may call Google and spend a request of the key's quota, so
  // nothing must prefetch or cache it.
  // Tight, per account: TutorService also shares one check between every
  // account for 15 s, so more accounts do not mean more calls.
  // Always 200 once the check ran, as health: the body carries the verdict.
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: TUTOR_CHECKS_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Test the server's LLM key and model with a one-word request (one request of its quota)",
  })
  @ApiOkResponse({
    type: TutorCheckDto,
    description: 'Always 200 once the check ran: status carries the verdict',
  })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiTooManyRequestsResponse({
    description: 'server.rateLimited: over 3 checks a minute for this account',
  })
  check(): Promise<TutorCheck> {
    return this.tutor.check();
  }
}
