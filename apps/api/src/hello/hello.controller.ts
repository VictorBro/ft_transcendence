import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HelloResponseDto } from './dto/hello-response.dto';
import { HelloService } from './hello.service';

@ApiTags('hello')
@Controller('hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get()
  @ApiOperation({ summary: 'Smoke-test endpoint' })
  @ApiOkResponse({ type: HelloResponseDto })
  greet(): HelloResponseDto {
    return this.hello.greet();
  }
}
