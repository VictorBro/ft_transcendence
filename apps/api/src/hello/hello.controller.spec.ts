import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HelloController } from './hello.controller';
import { HelloService } from './hello.service';

describe('HelloController', () => {
  let controller: HelloController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HelloController],
      providers: [HelloService],
    }).compile();

    controller = moduleRef.get(HelloController);
  });

  it('delegates to the service', () => {
    expect(controller.greet()).toEqual({ message: 'Hello from @ft/api' });
  });
});
