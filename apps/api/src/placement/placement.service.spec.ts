import { beforeEach, describe, expect, it } from 'vitest';

import { PlacementService } from './placement.service';

describe('PlacementService', () => {
  let service: PlacementService;

  beforeEach(() => {
    service = new PlacementService();
  });

  it('defines startPlacement', async () => {
    await expect(service.startPlacement('user-1', { lang: 'en' })).resolves.toBeUndefined();
  });

  it('defines getPlacement', async () => {
    await expect(service.getPlacement('user-1')).resolves.toBeUndefined();
  });

  it('defines submitAnswer', async () => {
    await expect(
      service.submitAnswer('user-1', {
        questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
        choice: 'ist',
      }),
    ).resolves.toBeUndefined();
  });

  it('defines quitPlacement', async () => {
    await expect(service.quitPlacement('user-1')).resolves.toBeUndefined();
  });
});
