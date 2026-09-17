# Backlog

Work we know we owe, not yet scheduled. Anything with an owner and a date belongs
on the board instead.

## Legal pages

`apps/web/lib/legal-content/{en,fr,de}.ts` were written before avatar upload
existed. The privacy policy names the avatar as something other learners see, but
says nothing about storing an uploaded image, where it lives, or when it is
deleted. Terms of service needs the same pass: what a user may upload, and what
happens to it when they remove it or delete the account.

Three languages, and `LEGAL_MINIMUM_CHARACTERS` is asserted on the rendered page.

## README

Fifteen `TODO` placeholders, all of them things the defence asks for directly:
the five 42 logins, project management, the database schema, the features list,
the modules with their point totals, and per-member contributions.

## No TODOs, no commented-out code

Nothing ships with a `TODO` or a commented-out block. One left in source today:

- `Makefile` seed target, which goes away with the question bank seeder.
