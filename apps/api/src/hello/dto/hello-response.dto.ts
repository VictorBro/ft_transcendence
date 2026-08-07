import { ApiProperty } from '@nestjs/swagger';

export class HelloResponseDto {
  @ApiProperty({ example: 'Hello from @ft/api' })
  message!: string;
}
