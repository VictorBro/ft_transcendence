import globals from 'globals';

import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Nest reads design:paramtypes at runtime, and `import type` erases the
      // metadata the injector needs. Never enable this rule for the API.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Nest modules are classes with decorators and no members.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    ignores: ['dist/**'],
  },
];
