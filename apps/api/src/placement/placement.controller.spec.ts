import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@ft/shared';

import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';

describe('PlacementController', () => {
  let controller: PlacementController;
  let service: PlacementService;

  const user: SessionUser = {
    id: '3f0f9d1e-8a2c-4f3b-9c1d-6d2c5b8a7e41',
    email: 'learner@example.com',
    displayName: 'learner',
    avatarUrl: null,
    locale: 'en',
    role: 'USER',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    service = {
      startPlacement: vi.fn(),
      getPlacement: vi.fn(),
      submitAnswer: vi.fn(),
      quitPlacement: vi.fn(),
      abortExam: vi.fn(),
    } as unknown as PlacementService;

    controller = new PlacementController(service);
  });

  it('delegates startPlacement to service', async () => {
    const dto = { lang: 'de' as const };
    await controller.startPlacement(user, dto);
    expect(service.startPlacement).toHaveBeenCalledWith(user.id, dto);
  });

  it('delegates getPlacement to service', async () => {
    await controller.getPlacement(user);
    expect(service.getPlacement).toHaveBeenCalledWith(user.id);
  });

  it('delegates submitAnswer to service', async () => {
    const dto = {
      questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
      choice: 'ist',
    };
    await controller.submitAnswer(user, dto);
    expect(service.submitAnswer).toHaveBeenCalledWith(user.id, dto);
  });

  it('delegates quitPlacement to service', async () => {
    await controller.quitPlacement(user);
    expect(service.quitPlacement).toHaveBeenCalledWith(user.id);
  });

  it('delegates abortExam to service', async () => {
    await controller.abortExam(user);
    expect(service.abortExam).toHaveBeenCalledWith(user.id);
  });
});
