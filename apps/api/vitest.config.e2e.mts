import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Self-contained rather than importing vitest.config.mts: mergeConfig
// concatenates `include`, which would run every unit spec here a second time.
export default defineConfig({
  oxc: false,
  plugins: [
    // See vitest.config.mts: without swc, Nest cannot resolve any provider.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // A cold container boots the whole Nest graph before the first assertion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
