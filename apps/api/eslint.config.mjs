// .mjs, not .js: this package must stay CommonJS ("type": "module" would make
// Nest's dist/main.js unloadable), and ESLint imports the config file as-is.
import nest from '@ft/eslint-config/nest';

export default [
  ...nest,
  {
    // src/generated is the Prisma client: emitted code, never hand-edited.
    ignores: ['dist/**', 'coverage/**', '**/generated/**'],
  },
];
