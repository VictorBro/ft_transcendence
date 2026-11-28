import next from '@ft/eslint-config/next';

export default [
  ...next,
  {
    // A raw password input has no Show password button: every one goes through
    // PasswordField, which form.tsx alone draws.
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    ignores: ['components/form.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='type'][value.value='password']",
          message: 'Use PasswordField from @/components/form: it carries the Show password toggle.',
        },
        {
          // The same input written in braces: type={'password'}.
          selector:
            "JSXAttribute[name.name='type'] > JSXExpressionContainer > Literal[value='password']",
          message: 'Use PasswordField from @/components/form: it carries the Show password toggle.',
        },
      ],
    },
  },
];
