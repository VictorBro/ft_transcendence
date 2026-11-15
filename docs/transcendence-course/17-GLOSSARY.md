# 17 · Glossaire technique (Module 14)

Les termes sont expliqués **tels qu'ils servent dans notre projet**. Ordre alphabétique.

## Termes généraux

| Terme | Explication simple | Chez nous |
|---|---|---|
| **Adapter (Prisma)** | Pilote qui relie Prisma à une base. | `@prisma/adapter-pg` (node-postgres), obligatoire en Prisma 7. |
| **API** | Ensemble de points d'entrée qu'un programme expose à d'autres. | L'API NestJS sous `/api`. |
| **App Router** | Système de routing de Next.js basé sur le dossier `app/`. | `apps/web/app/[locale]/…` |
| **argon2id** | Algorithme de hachage de mots de passe, lent exprès, résistant aux GPU. | `auth.service.ts`. |
| **Authentication** | Prouver qui on est. | Mot de passe + TOTP. |
| **Authorization** | Vérifier ce qu'on a le droit de faire. | `AuthGuard`, routes « à moi » par `@CurrentUser()`. |
| **Backoff exponentiel** | Attendre de plus en plus longtemps entre deux essais. | Reconnexion du socket : 1, 2, 4, 8, 10 s. |
| **Cascade** | Supprimer automatiquement les lignes dépendantes. | Supprimer un `User` supprime ses `UserLevel`. |
| **CECRL (CEFR)** | Cadre européen des niveaux de langue A1 → C2. | enum `Level`. |
| **Clé étrangère (FK)** | Colonne qui référence la clé primaire d'une autre table. | `UserLevel.userId → User.id`. |
| **Clé primaire (PK)** | Identifiant unique d'une ligne. | `User.id` (UUID), `Friendship.pairKey`. |
| **Client Component** | Composant React exécuté aussi dans le navigateur (`'use client'`). | Formulaires, lecteur de leçon. |
| **Container** | Processus isolé lancé depuis une image Docker. | 12 services Compose. |
| **Controller** | Classe Nest qui reçoit une requête et appelle un service. | `*.controller.ts`. |
| **Cookie httpOnly** | Cookie inaccessible au JavaScript de la page. | `ft.sid`. |
| **CORS** | Règles du navigateur pour les requêtes vers une autre origine. | Inutile chez nous (même origine). |
| **CSRF** | Attaque qui fait envoyer une requête par le navigateur de la victime. | Atténuée par `SameSite=Lax`. |
| **DTO** | Objet qui décrit la forme d'une requête/réponse. | `createZodDto(Schema)`. |
| **Endpoint** | Une URL + une méthode HTTP de l'API. | `POST /api/auth/login`. |
| **Guard** | Code Nest qui autorise ou refuse une requête avant le contrôleur. | `AuthGuard`, `IdentityThrottlerGuard`. |
| **Healthcheck** | Test périodique qui dit si un service va bien. | `HEALTHCHECK` des Dockerfiles, `/api/health`. |
| **HMAC** | Signature d'un message avec une clé secrète. | Réfs des unités de leçon (`attempt-ref.ts`). |
| **Hook (React)** | Fonction `useXxx` qui donne de l'état ou des effets à un composant. | `useErrorMessage`, `useSocketStatus`. |
| **Hydratation** | Moment où React « prend la main » sur le HTML rendu par le serveur. | Source d'erreurs console, surveillée par la console gate. |
| **i18n** | Internationalisation : traduire l'interface. | next-intl, 3 langues. |
| **Injection de dépendances (DI)** | Le framework fournit les objets dont une classe a besoin. | `constructor(private prisma: PrismaService)`. |
| **Middleware** | Code qui s'exécute sur chaque requête avant le traitement. | `express-session`, `httpMetrics`, `proxy.ts` côté Next. |
| **Migration** | Fichier SQL daté qui fait évoluer le schéma. | 13 dans `prisma/migrations`. |
| **Monorepo** | Un dépôt pour plusieurs projets. | pnpm workspaces. |
| **ORM** | Bibliothèque qui manipule la base avec des objets. | Prisma. |
| **Pipe** | Code Nest qui valide/transforme une valeur d'entrée. | `CodeValidationPipe`, `LangParam`. |
| **Props** | Paramètres passés à un composant React. | `<GoalPicker lang dailyGoal />`. |
| **Rate limiting / throttling** | Limiter le nombre de requêtes. | 100/min global, 5/min login. |
| **Reverse proxy** | Serveur placé devant d'autres, qui reçoit et redistribue. | Caddy. |
| **Room (Socket.IO)** | Groupe de sockets ciblés ensemble. | `user:<id>`, `session:<sid>`. |
| **Server Component** | Composant React exécuté uniquement sur le serveur. | Les pages. |
| **Service** | Classe qui contient la logique métier. | `LessonsService`. |
| **Session** | État de connexion gardé côté serveur, désigné par un id dans un cookie. | Redis `sess:<id>`. |
| **Session fixation** | Imposer un id de session connu avant la connexion. | Évitée par `session.regenerate`. |
| **SSR** | Rendu de la page HTML côté serveur. | Pages Next qui appellent l'API. |
| **State** | Données qui changent dans un composant. | `useState` ; pas de store global. |
| **TOTP** | Code à usage unique basé sur l'heure (applis d'authentification). | `otpauth`, 6 chiffres, 30 s. |
| **Transaction** | Groupe d'opérations en base, tout ou rien. | `prisma.$transaction(async (tx) => …)`. |
| **Upsert** | Insérer ou mettre à jour si la ligne existe. | `lessonResult.upsert`, seed. |
| **Volume** | Stockage Docker persistant. | `pg-data`, `avatars-data`… |
| **WebSocket** | Connexion permanente bidirectionnelle. | Socket.IO sur `/ws`. |
| **Zod** | Bibliothèque de schémas de validation TypeScript. | `@ft/shared`. |

## Termes propres à notre code

| Terme | Explication |
|---|---|
| **Attempt (tentative)** | Une partie d'une leçon par un apprenant, `LessonAttempt` : curseur, réponses, deadline, secret. |
| **`applyFinish`** | Fonction qui enregistre la fin d'une leçon : meilleur score, objectif, série, XP, succès (`lessons.service.ts`). |
| **`award`** | Calcule et écrit XP, défi et succès (`gamification.ts`). |
| **Brief** | La fiche d'une leçon (titre, résumé, mots, règles), JSON dans `content/briefs` puis `Lesson.brief`. |
| **Cell (cellule)** | Triplet (langue, niveau, catégorie) de la banque de questions, unité du regarnissage. |
| **Challenge (défi du jour)** | Un des 6 défis, choisi par hash de (cours, jour). |
| **`checkCourse`** | Vérifie un cours lu : `404 course.notFound`, `409 course.notPlaced`. |
| **Console gate** | Test Playwright qui échoue à la moindre erreur console. |
| **Content (leçon)** | Les exercices d'une leçon, `content/lessons/<id>.json` → `Lesson.content` (null pour le vocabulaire). |
| **Course (cours)** | Un `UserLevel` : un utilisateur apprenant une langue. |
| **Course day (`courseDay`)** | « Aujourd'hui » dans le fuseau de l'apprenant, jamais avant le dernier jour connu. |
| **Cursor (curseur)** | Index de la page courante d'une tentative ; ne recule jamais. |
| **Daily goal** | 10, 30 ou 60 minutes ; cible = goal / 10 leçons. |
| **Deadline** | Heure limite de la page d'examen courante, en base. |
| **`ERROR_CODES`** | Liste de tous les codes d'erreur (`schemas/errors.ts`). |
| **Extra** | Les 3 leçons proposées « en plus » du plan du jour. |
| **Fixture provider** | Faux LLM, réponses écrites à l'avance, par défaut. |
| **Item** | Un bloc d'une page de leçon (explication, exercice…). |
| **`kinds` / `playable`** | Registre des rendus par type de leçon dans le web ; seule la grammaire y est. |
| **`lockCourse`** | `SELECT … FOR UPDATE` sur la ligne `UserLevel`. |
| **Mother tongue** | Langue des consignes d'une tentative, fixée au départ. |
| **Outline** | Syllabus d'une langue et d'un niveau (`content/outlines`) ; aussi le résumé d'une leçon renvoyé au front. |
| **`pairKey`** | Clé d'une amitié : deux UUID triés joints par `:`. |
| **Placement** | Test de niveau adaptatif (dichotomie à partir de B1). |
| **Plan (leçon)** | La leçon aplatie en pages et unités, avec toutes les clés, reconstruite à chaque requête, jamais envoyée. |
| **Plan (jour)** | `done` / `proposed` / `extra` (`roadmap.rules.ts`). |
| **Presence** | Statut en ligne : compteur Redis `presence:<id>`. |
| **`ready`** | Une leçon a ses fichiers et passe la validation : elle peut être proposée et jouée. |
| **Redact** | Construire la vue d'une page sans les réponses (`redact.ts`). |
| **Ref (réf)** | Identifiant opaque d'une unité/option vu par le navigateur : HMAC tronqué. |
| **`RefreshOn`** | Composant qui fait `router.refresh()` sur un événement socket. |
| **Restock (regarnissage)** | Génération de nouvelles questions par le LLM quand une cellule est presque vide. |
| **Roadmap rules** | Règles pures du plan du jour, de la série et des niveaux. |
| **`SessionUser`** | Ce que l'utilisateur peut voir de lui-même (jamais le hash). |
| **Stale (`attempt.stale`)** | Soumission d'une page qui n'est pas celle du curseur, ou d'une tentative remplacée. |
| **Tab socket** | Le socket unique d'un onglet (`tab-socket.ts`). |
| **Unit (unité)** | Une réponse notée 0, 0,5 ou 1. |
| **`UserLevel`** | Table d'un cours (voir Course). |
