# Ma trace dans ft_transcendence — EA (VYAntares)

> Résumé tiré d'une ancienne analyse `CODE_OWNERSHIP.md` de `origin/main` au 2026-11-05 (ce fichier n'est pas dans le repo).
> Les chiffres de la section 1 se refont avec les commandes du tableau. Les pourcentages par fichier des sections suivantes
> viennent de l'ancienne analyse : ce sont des ordres de grandeur, que l'on ne peut pas refaire ici.
> La liste à jour des fichiers touchés est [docs/code-ownership.md](../../code-ownership.md) :
> depuis, 11 PR de plus sont à mon nom (#195, #202, #203, #206, #208, #214, #215, #218, #219, #220, #222), soit 29.
> `code-ownership.md` a été calculé après la fusion de #222 : il compte 29 PR, et liste les 5 fichiers de #222.
> Identités Git : `VYAntares <endroahm@hotmail.com>` et `EA <endroahm@hotmail.com>` (même personne).

## 1. En chiffres

Seulement des chiffres que l'on peut refaire :

| Indicateur                                              | Valeur | Comment le refaire                                                                                                  |
| ------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| PR fusionnées sur `main` que j'ai ouvertes, jusqu'à #215 |     29 | `gh pr list --repo VictorBro/ft_transcendence --author VYAntares --state merged --base main --limit 300 --search 'merged:<2026-11-27' --json number --jq length` |
| Période (première et dernière de ces PR)                | 2026-08-22 → 2026-11-26 | la même commande avec `--json number,mergedAt`                                                     |
| Fichiers touchés (créés ou modifiés, même d'une ligne)  |    704 | [docs/code-ownership.md](../../code-ownership.md), « En un coup d'œil », avec sa méthode de calcul |
| … dont code (`apps`, `packages`, `e2e`)                 |    267 | idem                                                                                                                |

Les parts en lignes de l'ancienne analyse (total, par zone) ne sont plus données ici : personne ne peut les refaire sans ce fichier.

Mon rôle en une phrase : **je porte le domaine des leçons**, de la base de données au contenu : lecture et recherche via l'API, validateurs partagés, outil de génération avec Claude Code, seed, démo, codes d'erreur, génération de questions par LLM. J'ai aussi construit quelques pièces autour : le statut en ligne, la leçon de lecture, le tuteur et sa voix, le menu du header, les garde-fous de la 2FA et les vérifications au démarrage de l'API.

## 2. Mes zones du repo

La liste des fichiers que j'ai touchés, dossier par dossier, est dans [docs/code-ownership.md](../../code-ownership.md). Les zones où je suis le plus présent : les schémas et validateurs de leçons de `packages/shared/src/lessons/` (portés du prototype de Bastian, `bastian-schnitzler/lesson_prototype@928484d`, dans #142, puis étendus dans #162), l'outillage de génération de contenu, et le backend des leçons, de l'objectif quotidien et de la démo.

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
- `prompts/question-batch.prompt.ts` (`buildQuestionBatchPrompt`), `question-batch.ts`, réapprovisionnement avec retry (`question-stock.service.ts`) ; quand il n'y a plus de question non vue, le placement ressert la plus ancienne question déjà vue (`UserSeenQuestion`, dans `placement/placement-question.service.ts`).
- Docs : `QUESTION_GENERATION.md` (94 %), `GEMINI_PROVIDER.md` (78 %).
- Retravaillé ensuite par VictorBro (#104, #130) et ninisse.

### Socle — codes d'erreur (#126)

- `error-code.filter.ts` (100 %) : JSON invalide → `request.invalid`, corps > 100 kB → `request.tooLarge`, tout autre statut sans code (route inconnue 404, crash 500…) → `server.unexpected`.
- `validation.pipe.ts` (81 %) : `CodeValidationPipe`, `LangParam`.

### `prisma/seed.ts` (77 %) — seed (#58, #140, #142, #143)

- `seedQuestionBank`, `findContentDir`, doublons de `sourceId` refusés avant la transaction, seed des leçons depuis les outlines.
- Migration `add_lesson_content` (#142).

### `src/throttler/` (#20)

- `identity-throttler.guard.ts` + spec (100 % à mon nom, mais VictorBro les a retravaillés dans #21, commit `e2768146`, fusionnée dans ma #20 : voir l'attention en 5).

### `scripts/lessons/` — outil `lessons:author` (#178)

- `author.ts`, `prompt.ts` (`systemPrompt`, `lessonPrompt`, `issuesPrompt`, `PROMPT_VERSION`), `providers/claude.ts`, `providers/chat.ts` (`QuotaError`, `RateLimitError`, `retryRateLimits`), `check.ts`, `check-draft.ts`, `edits.ts`, `reply.ts`, `times.ts`, `report.ts`, skill `author-lessons`.
- Pilote la CLI Claude Code par `child_process` dans une boucle « écrire, valider, corriger ».

### `src/presence/` — statut en ligne (#195)

- `presence.service.ts` : un compteur Redis par utilisateur (`presence:<userId>`), +1 par onglet ouvert, −1 par onglet fermé après un délai de grâce. Les amis acceptés sont prévenus quand on passe de 0 à 1, et de 1 à 0.
- Branché sur la gateway WebSocket de VictorBro (#181). Voir [presence/](presence/README.md).

### `src/prisma/` et `src/redis/` — vérifications au démarrage (#222)

- `PrismaService.onModuleInit` fait un vrai `SELECT 1`, avec 5 s maximum par connexion. `RedisService` abandonne si la première connexion échoue, et se reconnecte ensuite.
- Les deux services sont de VictorBro (#3), je n'ai changé que leur démarrage. Voir [startup-checks/](startup-checks/README.md).

### `src/auth/` — garde-fous de la 2FA (#219)

- `two-factor.service.ts` : `setup` et `enable` refusent avec `twoFactor.alreadyEnabled` (409) quand la 2FA est déjà active. La 2FA elle-même est de VictorBro (#5). Voir [two-factor-guards/](two-factor-guards/README.md).

### Tests e2e API (`apps/api/test/`)

- `lessons.e2e-spec.ts` (95 %), `demo.e2e-spec.ts` (94 %), `error-codes.e2e-spec.ts` (86 %), `seed.e2e-spec.ts` (68 %).

## 4. Hors backend

- **`packages/shared/src/lessons/`** (#142, #162) : `schemas/*` (vocabulaire, grammaire, lecture, fonctions, `artifactCommon`), `validation/*` (`validateBrief`, `validateContent`, `checkGrammarContent`…), `domain/*` (`parseRichText`, `vocabularyLesson`, `lessonCopy`…), `validateLesson`. Porté du prototype de Bastian (`bastian-schnitzler/lesson_prototype@928484d`), puis étendu à DE et EN.
- **Frontend** (#20, #125) : page chat et coquille `(mode)` (supprimées depuis par VictorBro : les autres modes dans la #64, la page chat et la coquille dans la #200), `healthz/upstream`, parties de `lib/api.ts` et `lib/session.ts`, tutoiement en français.
- **Frontend, depuis le 2026-11-05** : la leçon de lecture (#203, [reading-lesson/](reading-lesson/README.md)), le tuteur en Markdown et la voix « Écouter » (#214, [tutor-and-voice/](tutor-and-voice/README.md)), le menu du header et les écrans de téléphone (#220, [header-menu/](header-menu/README.md)), le point vert (#195), le mot de passe vérifié dans le navigateur pour couper la 2FA (#218).
- **Tests navigateur** : la boucle parcours et leçon sur de vraies leçons (#202, [e2e-roadmap/](e2e-roadmap/README.md)).
- **Textes** : la politique de confidentialité alignée sur ce que fait la plateforme (#206), le tutoiement partout en français (#125, #208). Voir [privacy-and-tu/](privacy-and-tu/README.md).
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
| 10-08 | #125 | Tutoiement des apprenants en français                                              |                        62 / 62 |
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
| 11-03 | #185 | Briefs et leçons DE, A1 à C2                                                       |                     1 / 66 509 |
| 11-12 | #195 | Statut en ligne : compteur Redis, point vert des amis                              |                              — |
| 11-18 | #202 | Test navigateur du parcours et des leçons sur de vraies leçons                     |                              — |
| 11-20 | #203 | La leçon de lecture dans le navigateur                                             |                              — |
| 11-20 | #206 | Politique de confidentialité alignée sur ce que fait la plateforme                 |                              — |
| 11-20 | #208 | Tutoiement cohérent en français dans les leçons et le prompt                       |                              — |
| 11-23 | #214 | Le Markdown du tuteur et une voix naturelle pour « Écouter »                       |                              — |
| 11-23 | #218 | Le mot de passe pour couper la 2FA vérifié dans le navigateur                      |                              — |
| 11-23 | #219 | Refuser setup et enable quand la 2FA est déjà active                               |                              — |
| 11-23 | #220 | Menu du header, cartes du cours, écrans de téléphone                               |                              — |
| 11-26 | #215 | Réorganisation de `docs/`, une page par module                                     |                              — |
| 11-26 | #222 | Arrêter l'API au démarrage sur une mauvaise `DATABASE_URL` ou `REDIS_URL`         |                              — |

Les PR après #185 ne sont pas dans l'ancienne analyse : pas de compte de lignes pour elles.

**Contributions dans les PR des autres** (cachées par le squash) : #104 placement (+178 lignes, dont 47 % de `change-level.tsx`), #29 migration onboarding (+145, avec `schemas/item.ts`), #24 et #27 (petites retouches).

**Branche `feat/86-daily-goal-page`** (page de l'objectif quotidien + tests e2e) : fusionnée le 2026-11-05 dans la PR #186 de bastian-schnitzler. Ses commits d'origine sont tous de bastian-schnitzler.

### Attention : du code à mon nom que je n'ai pas écrit

- `apps/web/components/shell.tsx` et `throttle-by-ip.decorator.ts` (`@ThrottleByIp`) : écrits par VictorBro (#21, commit `e2768146`, fusionnée dans ma #20). Le même commit retravaille aussi `identity-throttler.guard.ts` et son test.
- Les fichiers de branding de la #133 : le commit d'origine est de `eahmeti`, une identité que Git ne rattache pas à mon compte. Ils ont été supprimés depuis (commit `0b00fa7`).
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
9. La présence : pourquoi un compteur Redis par personne, pourquoi attendre avant de retirer 1, pourquoi seuls les amis voient le point.
10. Le démarrage de l'API : pourquoi `$connect()` ne suffit pas, et quand Redis doit abandonner ou réessayer.
11. La leçon de lecture : le compte à rebours du survol, et comment un nouveau type de leçon se branche dans le lecteur de Bastian.
12. Les garde-fous de la 2FA : quels états sont refusés, avec quel code d'erreur.
