import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../auth/auth.decorators';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
// The Docker HEALTHCHECK has no session and must never get a 401.
@Public()
// The Docker HEALTHCHECK and CI poll this endpoint. Sharing the per-IP throttle
// budget with real traffic would make container health depend on load.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe', security: [] })
  @ApiOkResponse({ type: HealthResponseDto })
  // Always 200, including when a dependency is down: the body carries the
  // verdict. The image HEALTHCHECK only asks whether the API answers. Postgres
  // and Redis have their own healthchecks, and a wrong URL already stops the
  // API at start. Docker never restarts an unhealthy container, so a non-2xx
  // would only mark the API unhealthy during a database outage and fail
  // `docker compose up --wait`, which is not the API's fault.
  check(): Promise<HealthResponseDto> {
    return this.health.check();
  }
}
