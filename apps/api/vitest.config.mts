import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// .mts, not .ts: this package is CommonJS, and Vite's native config loader
// (soon the default) refuses ESM syntax in a file it must load as CJS.
export default defineConfig({
  // Vite 8 transforms with Oxc. Turning it off leaves swc as the only
  // transformer, so decorator metadata cannot silently depend on which of the
  // two ran first.
  oxc: false,
  plugins: [
    // Nest's injector reads constructor parameter types off `design:paramtypes`.
    // Neither esbuild nor a plain type-stripping transform emits that metadata,
    // so swc has to do the transform or every test that resolves a provider
    // fails with "Nest can't resolve dependencies".
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
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Bootstrap wiring and DI-only module classes carry no logic to assert;
      // the e2e suite exercises them instead.
      exclude: [
        'src/main.ts',
        'src/app.setup.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        // Prisma's emitted client: not our code, and large enough to swamp the
        // thresholds below.
        'src/generated/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
      },
    },
  },
});
