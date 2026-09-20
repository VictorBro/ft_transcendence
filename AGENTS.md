# General

- if the user has unstaged changes, ask him to stage or commit those
- at the end of a task, add learnings to the section "Learnings" of this file

# Module specific

## /apps/api/src/placement

- The binary search shall return the target level, that means, if the user made any mistake, the level the user will have to learn, not the level the user answered all questions correctly
- `getMaxQuestionsRemaining`: In active sessions, `askedInCurrentLevel` is at most 5 because the 6th answer triggers a level transition or marks the exam as ended. As a result, `current_level_remaining` is always >= 1 during question serving, so `maxRemaining` is guaranteed to be >= 1 at runtime, adhering to `PlacementQuestionSchema`'s `z.number().int().positive()` constraint. Test fixtures should only test reachable states with `askedInCurrentLevel <= 5`.
- `PlacementSessionService.hasActiveSession`: Checks only for Redis key existence (`EXISTS`); an existing session has to be discarded by the client via `quitPlacement`, otherwise the current placement has to persist. There can only one placement per user, not several placements e.g. per language.
- `checkOnboardingCompleted`: Onboarding completion is verified per `(userId, lang)` by checking if a `UserLevel` record exists in the database. In `PlacementService.startPlacement`, this check is performed directly via `await this.progressService.checkOnboardingCompleted(userId, dto.lang)` to properly guard against incomplete onboarding with `ConflictException('placement.onboardingIncomplete')`.

# Learnings
