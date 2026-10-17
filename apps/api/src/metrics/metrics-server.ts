import { createServer, Server } from 'node:http';

import { registry } from './metrics';

// Prometheus scrapes api:9464 (infra/monitoring/prometheus/prometheus.yml).
// A constant, not an env var: Prometheus' config hardcodes it anyway.
export const METRICS_PORT = 9464;

/**
 * Its own port, outside Nest: caddy never routes here and compose never
 * publishes it, so no guard, throttler or Swagger exemption is needed, and
 * /api/metrics does not exist.
 */
export function startMetricsServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    registry.metrics().then(
      (body) => res.writeHead(200, { 'content-type': registry.contentType }).end(body),
      () => res.writeHead(500).end(),
    );
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}
