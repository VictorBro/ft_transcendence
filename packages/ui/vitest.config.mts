import { defineConfig } from 'vitest/config';

// JSX transform settings are deliberately absent: Vitest 4 runs on rolldown-vite,
// whose oxc transformer reads jsx from tsconfig.json and ignores an `esbuild`
// block (it warns when both are set).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      thresholds: {
        lines: 60,
        functions: 60,
      },
    },
  },
});
