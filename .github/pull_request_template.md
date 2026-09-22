# What and why

<!-- One paragraph. What changes, and what problem it solves. Link the issue or
     the plan section (docs/TECHNICAL_PLAN.md) this belongs to. -->

Closes #

# How to verify

<!-- The commands a reviewer runs to see it work. Be specific: a route, a make
     target, a test file. "Run the app" is not verification.
     `make doctor` first if this is your first checkout of the branch. -->

```
make all
```

# Checklist

- [ ] `make all` is green locally. It runs every check CI runs, then the production stack, then Playwright against it, so green here means green there.
- [ ] Commits follow Conventional Commits (`feat(api): ...`), so commitlint passes.
- [ ] New or changed behaviour has a test; coverage stays at or above 60% lines and functions.
- [ ] No secret, key or token in the diff. New configuration is documented in `.env.example` and read through `compose.yml`.
- [ ] Versions added or changed are pinned exactly and recorded in `docs/VERSIONS.md`.
- [ ] Schema changes ship with their generated migration.
- [ ] In case you have changed scope of your issue you have documented this and agreed on change with owners of dependent issue
- [ ] You have read the code of issues you depend on and have aligned with these issues owners in case of unclear points
- [ ] You have requested agent's review (e.g. CoPilot) and rerequested it after each new commit

# Screenshots

<!-- UI changes only. Before and after. Delete this section otherwise. -->

# Notes for the reviewer

<!-- Anything that would otherwise be a surprise: a deliberate trade-off, a
     follow-up already planned, a file that looks wrong but is not. Delete if
     there is nothing to say. -->
