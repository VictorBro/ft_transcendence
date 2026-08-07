import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HelloService } from './hello.service';

describe('HelloService', () => {
  let service: HelloService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [HelloService] }).compile();

    service = moduleRef.get(HelloService);
  });

  it('greets', () => {
    expect(service.greet()).toEqual({ message: 'Hello from @ft/api' });
  });
});
