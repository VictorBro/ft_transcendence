# General

- if the user has unstaged changes, ask him to stage or commit those
- Do not create redundant pass-through wrapper methods when delegating to injected sub-services unless explicitly required by an external interface
- do check the files created by you for syntax errors and if you unintentionally left duplicate lines
- run prettier after each task you completed to check for syntax errors
- repeat until no errors: 1) pnpm run format:check && turbo run lint typecheck test:cov build; prettier --check 2) fix errors

# Module specific


# Learnings
