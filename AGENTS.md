# General

- if the user has unstaged changes, ask him to stage or commit those
- Do not create redundant pass-through wrapper methods when delegating to injected sub-services unless explicitly required by an external interface
- do check the files created by you for syntax errors and if you unintentionally left duplicate lines
- run prettier after each task you completed to check for syntax errors
- repeat until no errors: 1) pnpm run format:check && turbo run lint typecheck test:cov build; prettier --check 2) fix errors

# Module specific

## /apps/api/src/placement

- The binary search shall return the target level, that means, if the user made any mistake, the level the user will have to learn, not the level the user answered all questions correctly
- `getMaxQuestionsRemaining`: In active sessions, `askedInCurrentLevel` is at most 5 because the 6th answer triggers a level transition or marks the exam as ended. As a result, `current_level_remaining` is always >= 1 during question serving, so `maxRemaining` is guaranteed to be >= 1 at runtime, adhering to `PlacementQuestionSchema`'s `z.number().int().positive()` constraint. Test fixtures should only test reachable states with `askedInCurrentLevel <= 5`.
- `PlacementSessionService.hasActiveSession`: Checks only for Redis key existence (`EXISTS`); an existing session has to be discarded by the client via `quitPlacement`, otherwise the current placement has to persist. There can only one placement per user, not several placements e.g. per language.
- `checkOnboardingCompleted`: Onboarding completion is verified per `(userId, lang)` by checking if a `UserLevel` record exists in the database. In `PlacementService.startPlacement`, this check is performed directly via `await this.progressService.checkOnboardingCompleted(userId, dto.lang)` to properly guard against incomplete onboarding with `ConflictException('placement.onboardingIncomplete')`. Never recreate a pass-through wrapper method for `checkOnboardingCompleted` on `PlacementService`.
- `PlacementProgressService.adjustSessionFromAnswer`: Terminal transitions (`levelChange === 'up' && currIndex === hiIndex - 1` and `levelChange === 'down' && currIndex === loIndex`) end the placement exam and trigger `updateUserLevel` in a Prisma transaction.
- `PlacementService.getPlacement`: Kept strictly read-only to preserve HTTP GET idempotency and avoid side effects; timeouts are evaluated upon answer submission in `submitAnswer`.

# Learnings
