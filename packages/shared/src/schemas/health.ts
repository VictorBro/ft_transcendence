import { z } from 'zod';

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const DependencyNameSchema = z.enum(['database', 'redis']);
export type DependencyName = z.infer<typeof DependencyNameSchema>;

export const DependencyHealthSchema = z.object({
  name: DependencyNameSchema,
  status: HealthStatusSchema,
  latencyMs: z.number().nonnegative(),
});
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;

/**
 * Shape of `GET /api/health`. Caddy and the container HEALTHCHECK only read the
 * status code, but the dashboard and the e2e suite read this body, so it is a
 * contract like any other.
 */
export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.string().min(1),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  checkedAt: z.iso.datetime(),
  dependencies: z.array(DependencyHealthSchema).default([]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
