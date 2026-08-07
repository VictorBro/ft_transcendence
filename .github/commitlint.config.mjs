/**
 * Conventional Commits, spelled out instead of `extends:
 * ['@commitlint/config-conventional']`.
 *
 * The hygiene workflow runs commitlint through `pnpm dlx`, which resolves the
 * CLI into a throwaway store. A preset named in `extends` is looked up relative
 * to this file, finds nothing, and the run dies with a resolution error rather
 * than a lint failure. Inlining the ruleset removes that whole failure mode and
 * keeps commitlint out of the application dependency tree.
 *
 * The rules below are config-conventional's, unchanged. Level 2 fails, level 1
 * warns, and `--verbose` prints both.
 *
 * Graded criterion: commits from every team member, with clear messages.
 *
 *   feat(api): add refresh token rotation
 *   fix(web): stop the locale switcher losing the current route
 *   chore(ci): pin trivy-action to v0.36.0
 */
export default {
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build', // build system, Dockerfiles, compose
        'chore', // no production code change
        'ci', // workflows, Makefile, scripts
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style', // formatting only
        'test',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    'scope-case': [2, 'always', 'lower-case'],

    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],

    'header-max-length': [2, 'always', 100],

    'body-leading-blank': [1, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
};
