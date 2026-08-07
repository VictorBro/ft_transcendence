// .mjs, not .js: this package ships CommonJS from dist/, so package.json cannot
// declare "type": "module" without breaking `require('@ft/shared')` in NestJS.
import base from '@ft/eslint-config/base';

export default base;
