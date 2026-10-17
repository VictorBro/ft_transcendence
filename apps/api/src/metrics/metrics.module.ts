import { Module } from '@nestjs/common';

import { MetricsCollector } from './metrics.collector';

// Not @Global: everything else records through the module-level metrics in
// metrics.ts, so nothing needs to inject from here.
@Module({
  providers: [MetricsCollector],
})
export class MetricsModule {}
