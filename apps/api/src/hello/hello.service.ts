import { Injectable } from '@nestjs/common';

import { HelloResponseDto } from './dto/hello-response.dto';

@Injectable()
export class HelloService {
  greet(): HelloResponseDto {
    return { message: 'Hello from @ft/api' };
  }
}
