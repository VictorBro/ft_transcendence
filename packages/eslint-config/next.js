import nextPluginModule from '@next/eslint-plugin-next';
import reactHooksModule from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base from './base.js';

// Both plugins ship CommonJS with an __esModule default that Node's ESM interop
// does not unwrap, so the import lands on module.exports here.
const nextPlugin = nextPluginModule.default ?? nextPluginModule;
const reactHooks = reactHooksModule.default ?? reactHooksModule;

export default [
  ...base,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
