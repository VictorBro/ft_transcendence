# What and why

<!-- One paragraph. What changes, and what problem it solves. Link the issue or
     the plan section (docs/TECHNICAL_PLAN.md) this belongs to. -->

Closes #

# How to verify

<!-- The commands a reviewer runs to see it work. Be specific: a route, a make
     target, a test file. "Run the app" is not verification. -->

```
make dev
# then ...
```

# Checklist

- [ ] Commits follow Conventional Commits (`feat(api): ...`), so commitlint passes.
- [ ] `make ci` is green locally.
- [ ] New or changed behaviour has a test; coverage stays at or above 60% lines and functions.
- [ ] No secret, key or token in the diff. New configuration is documented in `.env.example` and read through `compose.yml`.
- [ ] Versions added or changed are pinned exactly and recorded in `docs/VERSIONS.md`.
- [ ] Browser console is clean on every page this touches, in a production build.
- [ ] Schema changes ship with the generated migration; a pgvector column is hand-written SQL and stays out of `schema.prisma` (`docs/VERSIONS.md` trap 2).

# Screenshots

<!-- UI changes only. Before and after. Delete this section otherwise. -->

# Notes for the reviewer

<!-- Anything that would otherwise be a surprise: a deliberate trade-off, a
     follow-up already planned, a file that looks wrong but is not. Delete if
     there is nothing to say. -->
