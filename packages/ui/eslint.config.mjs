// .mjs keeps package.json free of "type": "module": the package exports raw .tsx
// and the consuming bundler, not Node, decides how the source is interpreted.
import next from '@ft/eslint-config/next';

export default [
  ...next,
  {
    rules: {
      // @ft/ui is a component library, not a Next app, so this rule prints
      // "Pages directory cannot be found" on every lint run. The rest of
      // core-web-vitals and the react-hooks rules still apply.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
