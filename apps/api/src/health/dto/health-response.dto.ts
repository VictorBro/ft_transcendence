import { ApiProperty } from '@nestjs/swagger';
import type { DependencyHealth, HealthResponse, HealthStatus } from '@ft/shared';
import { DependencyNameSchema, HealthStatusSchema } from '@ft/shared';

/**
 * Swagger reads decorators off classes, and @ft/shared speaks Zod, so the two
 * describe the same payload in the two forms each tool needs. `implements`
 * is what keeps them from drifting: change the Zod schema and this stops
 * compiling.
 */
export class DependencyHealthDto implements DependencyHealth {
  @ApiProperty({ enum: DependencyNameSchema.options, example: 'database' })
  name!: DependencyHealth['name'];

  @ApiProperty({ enum: HealthStatusSchema.options, example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ description: 'Round-trip time of the probe', example: 1.42 })
  latencyMs!: number;
}

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: HealthStatusSchema.options, example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'api' })
  service!: string;

  @ApiProperty({ description: 'Deployed application version', example: '0.0.0' })
  version!: string;

  @ApiProperty({ description: 'Process uptime in whole seconds', example: 42 })
  uptimeSeconds!: number;

  @ApiProperty({ format: 'date-time' })
  checkedAt!: string;

  @ApiProperty({ type: [DependencyHealthDto] })
  dependencies!: DependencyHealthDto[];
}
