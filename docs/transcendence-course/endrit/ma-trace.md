# Ma trace dans ft_transcendence — EA (VYAntares)

> Résumé tiré de `CODE_OWNERSHIP.md` (analyse de `origin/main` au 2026-11-05).
> Identités Git : `VYAntares <endroahm@hotmail.com>` et `EA <endroahm@hotmail.com>` (même personne).

## 1. En chiffres

| Indicateur                                                        |                               Valeur |
| ----------------------------------------------------------------- | -----------------------------------: |
| PR fusionnées sur `main` (squash à mon nom)                       |                                   18 |
| Commits, toutes branches (hors merges)                            |                                   88 |
| Période                                                           |              2026-08-22 → 2026-11-04 |
| Lignes à mon nom, périmètre principal (code, tests, config, docs) |  **17 335 (27,4 %, 2e de l'équipe)** |
| … dont source / tests / docs / config                             |          10 189 / 4 801 / 2 291 / 54 |
| Contenu pédagogique (`content/`, JSON)                            | ≈ 200 900 lignes (87,6 % du contenu) |
| Fixtures de test                                                  |                10 398 lignes (100 %) |
| Fichiers du périmètre principal où j'ai au moins une ligne        |                                  193 |

Mon rôle en une phrase : **je porte le domaine des leçons**, de la base de données au contenu : lecture et recherche via l'API, validateurs partagés, outil de génération avec Claude Code, seed, démo, codes d'erreur, génération de questions par LLM.

## 2. Mes parts par zone du repo

| Zone                                                     |                        Ma part |
| -------------------------------------------------------- | -----------------------------: |
| Shared – Schémas et validateurs de leçons                |                     **99,4 %** |
| Outillage de génération de contenu (scripts, skills)     |                     **75,7 %** |
| Backend – Leçons, objectif quotidien, gamification, démo |                     **58,9 %** |
| Base de données (Prisma)                                 |                         30,4 % |
| Backend – Socle (erreurs, validation)                    |                         29,5 % |
| Backend – Cours, placement, banque de questions, LLM     |                         27,6 % |
| Backend – Auth / rate limiting                           | 17,7 % (voir l'attention en 5) |
| Documentation                                            |                         16,7 % |
| Frontend Next.js                                         |                          6,8 % |
| Tests E2E Playwright                                     |                          5,0 % |

## 3. Les modules backend où j'ai travaillé (`apps/api`)

### `src/lessons/` — lecture et recherche des leçons (#128, #178)

- `lessons.controller.ts` (71 %) : `GET courses/:lang/today`, `GET courses/:lang/lessons`, `GET courses/:lang/lessons/:id`. Renvoie 404 sans cours et 409 avant le placement.
- `lessons.service.ts` (80 %) : chaque requête Prisma a un `select` explicite, donc le brief ne sort jamais de la base.
- `lesson-search.ts` (100 %) : `searchLessons`, `bareVowels`, recherche insensible aux accents.
- `course-lookup.ts` (94 %) : `checkCourse`, `findLesson`.
- `lessons.dto.ts`, `lessons.module.ts`. Tests : `lesson-search.spec.ts`, `course-lookup.spec.ts`, `lesson-complete.spec.ts`, `lesson-edits.spec.ts`.
- _Pas à moi dans ce dossier_ : fin de leçon et objectif (Luca, #141), règles roadmap/streak (ninisse), gamification (ninisse).

### `src/demo/` — apprenants de démo (#143), 100 %

- `demo.ts` (`seedDemo`, `replayLearner`), `demo.planner.ts` (`planCourse`, `daysToAttemptAll`), `demo.clock.ts` (`Random` à graine fixe), `demo.data.ts` (`DEMO_PROFILES`).

### `src/llm/` + `src/question-generation/` — génération de questions par LLM (#69, #111, #121)

- `llm.provider.ts` (`LlmProvider`, token `LLM_PROVIDER`), `llm.module.ts`, `llm.factory.ts`, `fixture.provider.ts`, `gemini.provider.ts`.
- `prompts/question-batch.prompt.ts` (`buildQuestionBatchPrompt`), `question-batch.ts`, réapprovisionnement avec retry et repli sur `UserSeenQuestion`.
- Docs : `QUESTION_GENERATION.md` (94 %), `GEMINI_PROVIDER.md` (78 %).
- Retravaillé ensuite par VictorBro (#104, #130) et ninisse.

### Socle — codes d'erreur (#126)

- `error-code.filter.ts` (100 %) : JSON invalide → `request.invalid`, corps > 100 kB → `request.tooLarge`, route inconnue ou crash → `server.unexpected`.
- `validation.pipe.ts` (81 %) : `CodeValidationPipe`, `LangParam`.

### `prisma/seed.ts` (77 %) — seed (#58, #140, #142, #143)

- `seedQuestionBank`, `findContentDir`, doublons de `sourceId` refusés avant la transaction, seed des leçons depuis les outlines.
- Migration `add_lesson_content` (#142).

### `src/throttler/` (#20)

- `identity-throttler.guard.ts` + spec (100 % à mon nom).

### `scripts/lessons/` — outil `lessons:author` (#178)

- `author.ts`, `prompt.ts` (`systemPrompt`, `lessonPrompt`, `issuesPrompt`, `PROMPT_VERSION`), `providers/claude.ts`, `providers/chat.ts` (`QuotaError`, `RateLimitError`, `retryRateLimits`), `check.ts`, `check-draft.ts`, `edits.ts`, `reply.ts`, `times.ts`, `report.ts`, skill `author-lessons`.
- Pilote la CLI Claude Code par `child_process` dans une boucle « écrire, valider, corriger ».

### Tests e2e API (`apps/api/test/`)

- `lessons.e2e-spec.ts` (95 %), `demo.e2e-spec.ts` (94 %), `error-codes.e2e-spec.ts` (86 %), `seed.e2e-spec.ts` (68 %).

## 4. Hors backend

- **`packages/shared/src/lessons/`** (#142, #162), à 99 % à moi : `schemas/*` (vocabulaire, grammaire, lecture, fonctions, `artifactCommon`), `validation/*` (`validateBrief`, `validateContent`, `checkGrammarContent`…), `domain/*` (`parseRichText`, `vocabularyLesson`, `lessonCopy`…), `validateLesson`. Porté du prototype, puis étendu à DE et EN.
- **Frontend** (#20, #125) : page chat, coquille `(mode)`, `error.tsx`, `healthz/upstream`, parties de `lib/api.ts` et `lib/session.ts`, tutoiement en français.
- **Docs** : `docs/content/lessons.md` (98 %), décisions sur leçons, objectif et streak (#139).
- **Contenu** : outlines FR A2–C2, briefs et leçons FR/EN/DE de A1 à C2.

## 5. Mes PR, une par une

| Date  | PR   | Ce que j'ai fait                                                                   | Lignes restantes (code / tout) |
| ----- | ---- | ---------------------------------------------------------------------------------- | -----------------------------: |
| 08-22 | #20  | Première version du chat et de l'accueil (front), garde de throttling par identité |                      947 / 947 |
| 09-18 | #58  | Seed de la banque de questions depuis `content/items`                              |                      302 / 662 |
| 10-02 | #69  | Génération de questions par LLM quand le pool est vide (provider, prompt, retry)   |                      317 / 317 |
| 10-04 | #111 | Modèle Gemini par défaut : `gemini-3.6-flash`                                      |                          4 / 4 |
| 10-09 | #121 | Outlines FR A2 à C2, docs LLM et génération de questions                           |                 1 659 / 10 173 |
| 10-09 | #126 | Un code d'erreur dans chaque réponse d'erreur de l'API (filtre et pipe)            |                      443 / 443 |
| 10-09 | #125 | Tutoiement des apprenants en français                                              |                        62 / 62 |
| 10-13 | #128 | API des leçons : today, liste, détail, recherche sans accents                      |              **1 896** / 1 896 |
| 10-21 | #140 | Seed des leçons depuis les outlines                                                |                        32 / 32 |
| 10-21 | #139 | Doc des décisions sur leçons, objectif quotidien et streak                         |                      527 / 527 |
| 10-21 | #133 | Nouveau branding (voir l'attention plus bas)                                       |                      346 / 346 |
| 10-28 | #142 | Portage des schémas et validateurs de leçons du prototype vers `@ft/shared`        |             **7 211** / 17 551 |
| 10-29 | #143 | Apprenants de démo sur les stacks de dev                                           |                  1 200 / 1 200 |
| 10-30 | #162 | Validateurs de leçons pour l'allemand et l'anglais                                 |                      437 / 437 |
| 11-01 | #178 | Outil `lessons:author` : Claude Code écrit et valide les leçons                    |              **1 935** / 1 935 |
| 11-02 | #183 | Briefs et leçons FR, A1 à C2                                                       |                    16 / 64 573 |
| 11-03 | #184 | Briefs et leçons EN, A1 à C2                                                       |                     0 / 61 329 |
| 11-04 | #185 | Briefs et leçons DE, A1 à C2                                                       |                     1 / 66 509 |

**Contributions dans les PR des autres** (cachées par le squash) : #104 placement (+178 lignes, dont 47 % de `change-level.tsx`), #29 migration onboarding (+145, avec `schemas/item.ts`), #24 et #27 (petites retouches).

**En cours, pas encore sur `main`** : branche `feat/86-daily-goal-page` (page de l'objectif quotidien + tests e2e).

### Attention : du code à mon nom que je n'ai pas écrit

- `apps/web/components/shell.tsx` et `throttle-by-ip.decorator.ts` (`@ThrottleByIp`) : écrits par VictorBro (#21, fusionnée dans ma #20).
- `docs/brand/*` (#133) : le commit d'origine est de `eahmeti`, une identité que Git ne rattache pas à mon compte.
- `lib/api.test.ts` et `e2e/support/session.ts` : environ 40 à 45 % écrits par VictorBro.

## 6. Ce que je dois savoir expliquer

1. La structure d'une leçon (brief + contenu) pour les 4 types, et ce que vérifie chaque validateur.
2. Zod avancé : `superRefine`, schémas stricts, textes localisés, agrégation des problèmes dans `validateLesson`.
3. Prisma : `select` explicite, pagination, seed idempotent en transaction, détection des doublons.
4. NestJS : statuts 404 et 409, filtres d'exception, pipes, contrat `ERROR_CODES` entre l'API et le front.
5. Recherche insensible aux accents (normalisation Unicode).
6. Abstraction du fournisseur LLM et injection par token (`LLM_PROVIDER`).
7. `lessons:author` : pilotage de la CLI par `child_process`, prompts versionnés, gestion des quotas et des 429.
8. Ce qui vient du prototype (#142) et ce que j'ai adapté ensuite (#162).
