import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  check(): HealthResponseDto {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: this.config.get<string>('APP_VERSION', '0.0.0'),
    };
  }
}
