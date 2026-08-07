import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ description: 'Process uptime in whole seconds', example: 42 })
  uptime!: number;

  @ApiProperty({ description: 'Deployed application version', example: '0.0.0' })
  version!: string;
}
