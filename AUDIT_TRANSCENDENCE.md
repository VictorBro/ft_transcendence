# Audit ft_transcendence : état des lieux au 26 octobre 2026

Audit en lecture seule de la branche `feat/85-demo-learners` (main + 3 commits de seed démo),
avec un coup d'œil aux branches distantes non mergées. Rien n'a été modifié dans le projet.
Je n'ai ni lancé la stack ni exécuté les tests : les verdicts viennent de la lecture du code,
du schéma Prisma, des routes, des pages web et de la config.

Légende : ✅ fait · 🟡 en cours / partiel · ❌ pas commencé · ⚠️ risque à l'évaluation

---

## Résumé en une minute

|                                                                    | Points         |
| ------------------------------------------------------------------ | -------------- |
| **Modules validables aujourd'hui**                                 | **7**          |
| Si les modules en cours sont finis                                 | 7 + 9 = **16** |
| Plus WebSockets + interaction utilisateurs (prototype sur branche) | **20**         |
| Minimum requis / plafond qui compte (14 + 5 bonus)                 | 14 / 19        |

Les trois plus gros risques :

1. **Le README est rempli de TODO** : la première ligne avec les logins, Project Management,
   Database Schema, Features List, Modules, Individual Contributions et Resources (avec l'usage
   de l'IA, explicitement noté). Le sujet dit qu'un README incomplet pénalise.
2. **Aucune page web ne permet de suivre une leçon.** L'API sert `today`, `lessons`,
   `lessons/:id` et `PUT result`, mais côté web la page du cours affiche « roadmap soon ». Le
   cœur du produit ne se démontre pas encore dans le navigateur.
3. **Le README promet des choses qui n'existent pas encore** : « about 4,000 lessons »
   (`content/lessons/` ne contient qu'un fichier), « live practice and chat », « progress
   tracking and analytics », XP/défi/succès. Le sujet demande d'être « honest ».

---

## Chapitre II : organisation de l'équipe

| Exigence                                               | État | Constat                                                                                     |
| ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------- |
| Rôles PO, PM, Tech Lead, Devs attribués                | ✅   | Tableau dans le README : Bastian PO, Victor Tech Lead, Endrit PM, Anaïs PO bis, Luca PM bis |
| Rôles documentés dans le README                        | ✅   | Oui, avec responsabilités                                                                   |
| Outils de gestion de projet (recommandé)               | ✅   | GitHub Issues numérotées (#76 à #141), PR, CODEOWNERS, wiki points                          |
| Organisation du travail / communication dans le README | ⚠️   | « How work is organised: TODO » et « Communication: TODO »                                  |

---

## Chapitre III : partie obligatoire

Une seule exigence ratée entraîne le rejet, donc c'est la section à verrouiller en premier.

### III.2 Exigences générales

| Exigence                                        | État | Constat                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app avec frontend, backend, base de données | ✅   | Next.js + NestJS + PostgreSQL                                                                                                                                                                                                                                                                                   |
| Commits de tous les membres                     | ✅   | 5 personnes visibles (plusieurs identités git par personne : `VictorBro`, `VYAntares`, `Bastian Schnitzler` / `bastian-schnitzler` / `Bastian`, `EA` / `eahmeti`, `ninisse`, `luca-mattei` / `lumattei`). Pensez à expliquer qui est qui en défense                                                             |
| Messages de commit clairs                       | ✅   | Conventional commits + numéro d'issue, commitlint et husky                                                                                                                                                                                                                                                      |
| Répartition du travail                          | 🟡   | Ok globalement, mais déséquilibrée (52 / 38 / 35 / 22 / 14 commits). Chacun doit pouvoir défendre sa part                                                                                                                                                                                                       |
| Conteneurs, une seule commande                  | ✅   | `make` (checks, build, run, tests navigateur), 12 services dans `compose.yml`                                                                                                                                                                                                                                   |
| Compatible Chrome, pas d'erreur console         | ✅   | Projet Playwright chromium + `e2e/tests/console.spec.ts` (non exécuté ici)                                                                                                                                                                                                                                      |
| Privacy Policy et Terms of Service              | ✅   | `/privacy` et `/terms`, liens dans le footer, contenu réel en en/fr/de (~2 400 mots par langue), test e2e `legal.spec.ts`                                                                                                                                                                                       |
| Multi-utilisateurs simultanés                   | 🟡   | Sessions Redis, verrou `SELECT … FOR UPDATE` dans `apps/api/src/lessons/goal.ts`, clé primaire `(userLevelId, lessonId)` contre les doubles clics. **Il manque le test e2e à deux contextes navigateur** que `PRODUCT_ARCHITECTURE.md` §9 recommande : c'est la preuve la moins chère d'un critère éliminatoire |

### III.3 Exigences techniques

| Exigence                                                | État | Constat                                                                                                                                                              |
| ------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend clair, responsive, accessible                  | ✅   | Tailwind, breakpoints `lg`, `sr-only`, `role="status"` ; à vérifier sur mobile en vrai                                                                               |
| Framework CSS                                           | ✅   | Tailwind CSS 4                                                                                                                                                       |
| `.env` ignoré par Git + `.env.example`                  | ✅   | `.env` dans `.gitignore`, seul `.env.example` est suivi                                                                                                              |
| Schéma de base clair, relations définies                | ✅   | 7 modèles Prisma (`User`, `RecoveryCode`, `UserLevel`, `QuestionBank`, `UserSeenQuestion`, `Lesson`, `LessonResult`), 7 migrations, relations et cascades commentées |
| Inscription / connexion email + mot de passe sécurisées | ✅   | argon2 (salé par construction), hash factice contre les attaques par timing, sessions httpOnly                                                                       |
| Validation frontend **et** backend                      | ✅   | Schémas Zod partagés (`packages/shared`), `nestjs-zod` côté API, `safeParse` dans les formulaires web                                                                |
| HTTPS partout                                           | ✅   | Caddy en point d'entrée TLS unique ; seul Caddy publie un port                                                                                                       |

### Chapitre VI : README (obligatoire)

| Section demandée                            | État                                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| 1re ligne en italique avec les logins       | ⚠️ placeholders `<login1>` … `<login5>`                |
| Description, nom, fonctionnalités clés      | 🟡 présente, mais annonce des fonctionnalités absentes |
| Instructions (prérequis, `.env`, étapes)    | ✅                                                     |
| Resources + usage de l'IA                   | ❌ TODO                                                |
| Team Information                            | ✅                                                     |
| Project Management                          | 🟡 outils oui, organisation et communication TODO      |
| Technical Stack + justifications            | ✅                                                     |
| Database Schema                             | ❌ TODO                                                |
| Features List (qui a fait quoi)             | ❌ TODO                                                |
| Modules (liste, points, justification, qui) | 🟡 seul Monitoring est rédigé                          |
| Individual Contributions                    | ❌ TODO                                                |

---

## Chapitre IV : modules

### ✅ Faits, démontrables aujourd'hui : 7 points

| Module                          | Type  | Pts   | Preuves dans le code                                                                                                                                                                                                                        |
| ------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework frontend + backend    | Major | 2     | Next.js 16 (App Router) + NestJS 11                                                                                                                                                                                                         |
| ORM                             | Minor | 1     | Prisma 7, client généré, migrations, seed                                                                                                                                                                                                   |
| 2FA complet                     | Minor | 1     | TOTP (`otpauth`), QR code, codes de récupération hashés SHA-256 à usage unique, routes `2fa/setup`, `enable`, `verify`, `DELETE 2fa`, page `/settings/2fa`                                                                                  |
| i18n, ≥ 3 langues               | Minor | 1     | `next-intl`, en / fr / de avec 220 clés chacune, test qui exige des clés identiques, sélecteur de langue dans la nav, pages légales traduites                                                                                               |
| Monitoring Prometheus + Grafana | Major | 2     | Prometheus, Alertmanager, Grafana, exporters node / postgres / redis / blackbox, 4 dashboards provisionnés, 25 règles d'alerte testées avec promtool, Grafana derrière login, alertes vers Discord. Le seul module documenté dans le README |
| **Total**                       |       | **7** |                                                                                                                                                                                                                                             |

### 🟡 En cours ou partiels : 9 points potentiels

| Module                                 | Type  | Pts   | Ce qui existe                                                                                                                                                                                                      | Ce qui manque pour valider                                                                                                                                                                                                                       |
| -------------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Standard user management               | Major | 2     | `PATCH users/me`, upload / suppression d'avatar (multer, volume `avatars-data`) avec avatar par défaut, page `/profile` et `/profile/edit`                                                                         | **Amis et statut en ligne** : rien en base ni dans l'API. La page profil n'affiche que _son propre_ profil, il n'y a pas de `GET users/:id`                                                                                                      |
| Gamification                           | Minor | 1     | Règles complètes dans `apps/api/src/lessons/gamification.rules.ts` (XP, rangs, défi du jour, succès) + constantes et schémas dans `packages/shared`. Le streak et le meilleur streak sont stockés dans `UserLevel` | Les règles ne sont **appelées nulle part** (seul le test les importe). Pas de colonne XP ni de table de succès, rien à l'écran (#95, #97). À confirmer avec le staff : le module compte-t-il hors d'un jeu ?                                     |
| LLM system interface                   | Major | 2     | Abstraction `LlmProvider`, provider Gemini + provider fixture pour les tests, génération de questions de placement en arrière-plan (`question-generation`), throttler global                                       | Le sujet veut : génération **à partir d'une saisie utilisateur**, **streaming** géré, gestion d'erreurs + rate limiting. Aujourd'hui l'utilisateur ne parle jamais au LLM et rien n'est streamé. La page `/chat` « Tutor » est une coquille vide |
| SSR                                    | Minor | 1     | Les pages sont des Server Components (`force-dynamic`, `generateMetadata` avec de vrais titres)                                                                                                                    | Une démo pensée pour ça (JS désactivé → le contenu reste lisible) et une justification dans le README, cf. §9 de `PRODUCT_ARCHITECTURE.md`                                                                                                       |
| Recherche avancée                      | Minor | 1     | Backend complet : `GET courses/:lang/lessons` avec filtres, tri, pagination, recherche accent-insensible (`lesson-search.ts`), tests e2e                                                                           | **Aucune UI** : la page « all lessons » (#87) n'existe pas                                                                                                                                                                                       |
| Design system custom (≥ 10 composants) | Minor | 1     | `packages/ui` existe avec tests                                                                                                                                                                                    | Seulement **2 composants** (`Button`, `Card`). Il en faut 10, plus palette, typo et icônes documentées. Une vingtaine de composants dans `apps/web/components` pourraient y migrer                                                               |
| Health check + status page + backups   | Minor | 1     | `GET /api/health`, `/healthz` et `/healthz/upstream` côté web, healthchecks compose, sondes blackbox                                                                                                               | **Pas de backups automatisés, pas de procédure de reprise, pas de page de statut**                                                                                                                                                               |
| **Total si finis**                     |       | **9** |                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                  |

### 🟠 Commencés hors de main : prototypes anciens

| Module                                           | Type  | Pts | Constat                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temps réel (WebSockets)                          | Major | 2   | La route `/ws/*` est réservée dans Caddy (commentée « socket.io »), mais **aucune gateway sur main** et socket.io absent des dépendances. Un prototype de `chat.gateway.ts` dort sur `origin/conversation_schema` (16 août, Bastian), très en retard sur main |
| Interaction utilisateurs (chat + profils + amis) | Major | 2   | Les pages `/chat` et `/friends` existent mais sont des placeholders (`ComingSoon`). Aucun modèle `Friendship` ni `Message` en base. Même prototype sur `conversation_schema` ; `origin/copilot/feat-add-chat-interface` n'a aucun diff utile                  |

Ces deux modules + **Standard user management** partagent le même chantier (amis, présence,
socket). Les faire ensemble rapporte 6 points d'un coup.

### ❌ Pas commencés

**Prévus par l'équipe** (core ou buffer de `PRODUCT_ARCHITECTURE.md` §2) :

| Module                            | Type  | Pts | Constat                                                                                                                                                                                                                |
| --------------------------------- | ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RAG complet                       | Major | 2   | Seule l'image Postgres `pgvector` est en place : pas de colonne vector, pas d'embeddings, pas de corpus, pas de retrieval. La doc elle-même signale que ces 2 points sont « at risk » si le tuteur n'est pas construit |
| Navigateurs supplémentaires (≥ 2) | Minor | 1   | Playwright ne déclare que `chromium`. Il faudrait des projets firefox + webkit, une passe de correctifs et une section de limitations documentée                                                                       |
| Dashboard d'analytics utilisateur | Minor | 1   | Les données existent (`LessonResult`) ; aucune page                                                                                                                                                                    |
| Système de notifications          | Minor | 1   | Rien. Dépend du socket                                                                                                                                                                                                 |
| API publique                      | Major | 2   | Swagger (`/api/docs`) et throttler sont là, mais **aucune clé d'API**. Il faut 5 endpoints documentés protégés par clé                                                                                                 |
| Dashboard d'analytics avancé      | Major | 2   | Rien (graphiques, temps réel, export CSV / PDF)                                                                                                                                                                        |

**Explicitement exclus par l'équipe** : OAuth, RTL, WCAG AA, tous les modules jeu sauf
gamification, statistiques de jeu, WAF / Vault, ELK, microservices, blockchain, upload de
fichiers, PWA, permissions avancées (le `Role` existe en base mais n'est utilisé par aucune
garde), organisations, GDPR, export / import, voix, reconnaissance d'image, modération,
sentiment, recommandation, collaboratif temps réel, modules au choix.

---

## Chapitre VII : bonus

Le bonus ne compte qu'au-delà de 14 points validés, plafonné à +5. Avec 7 points sûrs
aujourd'hui, le bonus n'est pas encore un sujet. La cible de l'équipe (≈ 20 réclamables pour en
valider 19) reste cohérente, à condition que les modules « en cours » soient fermés.

---

## Chapitre VIII : soutenance

| Point                                          | État                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Petite modification de code demandée en direct | Chaque membre doit connaître sa zone. Le code est très commenté, c'est un atout                                                                                                                           |
| Expliquer l'usage de l'IA                      | ⚠️ section Resources vide. Le dépôt contient un skill Claude Code (`.claude/skills/outline-language`) et la doc dit que les leçons sont écrites avec Claude Code : à décrire honnêtement, tâche par tâche |
| Démontrer chaque module                        | ⚠️ un module non démontrable vaut 0. Aujourd'hui, la recherche avancée et la gamification ne sont pas démontrables malgré un backend avancé                                                               |

---

## Priorités suggérées, du plus rentable au moins rentable

1. **README** : logins, sections TODO, retirer ou nuancer ce qui n'existe pas. Zéro code, et ça
   évite une pénalité.
2. **Test e2e multi-contextes** pour la partie obligatoire « multi-user ». Petit, et ça couvre un
   critère éliminatoire.
3. **Pages leçons** (#86 daily goal, #87 all lessons, #96) : débloquent la démo du produit **et**
   la recherche avancée (+1) **et** l'affichage de la gamification.
4. **Gamification branchée** (#95, #97) : +1.
5. **Socket + amis + présence + chat** : +2 (WebSockets) +2 (interaction) +2 (user management
   complet) = 6 points.
6. Mineurs rapides : design system (déplacer 8+ composants dans `packages/ui`), SSR (démo JS
   désactivé), navigateurs (firefox + webkit dans Playwright). +3.
7. LLM : un point d'entrée où l'utilisateur écrit et reçoit une réponse **streamée** (le tuteur
   du chat, par exemple), avec rate limit dédié. +2. Puis RAG par-dessus si le temps le permet.

Avec 1 à 6, on arrive à 7 + 1 + 1 + 6 + 3 = **18 points**. Le LLM ou le health check
complet fait passer le cap des 19.
