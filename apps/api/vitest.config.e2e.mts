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
    // app.setup requires it at import time, and CI runs this without a shell.
    // The provider is pinned so no shell carrying a real key makes a test spend.
    env: { AVATAR_STORAGE_DIR: '/tmp/ft-avatars-e2e', LLM_PROVIDER: 'fixture', LLM_API_KEY: '' },
    // A cold container boots the whole Nest graph before the first assertion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Specs insert and delete shared catalogue rows (fixture lessons, results
    // over a whole level), so two files at once would see each other's rows.
    fileParallelism: false,
  },
});
