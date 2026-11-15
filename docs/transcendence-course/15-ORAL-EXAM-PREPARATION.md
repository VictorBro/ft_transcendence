# 15 · Préparation à la soutenance

Format de chaque question : **Réponse** (le fond), **Pourquoi** (ce qui la justifie),
**Fichiers**, **À l'oral** (une formulation naturelle, 20 à 40 secondes).

---

## A. Présentation du projet en 2 minutes

> « Notre ft_transcendence est une plateforme d'apprentissage des langues : anglais,
> français et allemand, avec une interface dans ces trois langues.
>
> Un apprenant crée un compte, choisit une langue et un objectif quotidien de 10, 30 ou
> 60 minutes. Il passe ensuite un test de placement adaptatif : on part du niveau B1 et on
> monte ou on descend par dichotomie selon ses réponses, jusqu'à trouver son niveau CECRL,
> de A1 à C2.
>
> Chaque jour, l'application lui propose le nombre de leçons qui correspond à son objectif.
> Il y a quatre types de leçons : grammaire, vocabulaire, actes de langage et lecture, avec
> des exercices corrigés tout de suite puis un examen chronométré. Le score, la série de
> jours et l'XP sont calculés par le serveur.
>
> Il y a aussi une partie sociale : profils publics, amis, et statut en ligne en temps réel.
>
> Techniquement : Next.js pour l'interface, NestJS pour toute la logique, PostgreSQL et
> Redis, Socket.IO pour le temps réel, le tout derrière un reverse proxy Caddy en HTTPS,
> dans Docker, lancé par une seule commande : `make`. »

## B. Présentation technique en 5 minutes

1. **La règle (30 s)** : « NestJS possède toute la logique métier et l'accès aux données ;
   Next.js fait la présentation et le rendu serveur. Il n'y a pas de Prisma dans le front. »
2. **La topologie (60 s)** : dessiner navigateur → Caddy (seul port publié, HTTPS) →
   `/api` et `/ws` vers NestJS, `/grafana` vers Grafana, le reste vers Next ; Next appelle
   l'API sur le réseau Docker pour le SSR ; l'API parle à Postgres et Redis. « Tout est
   sur la même origine, donc pas de CORS, et le cookie de session est first-party. »
3. **Le monorepo (45 s)** : pnpm + Turborepo ; `apps/web`, `apps/api`, `packages/shared`
   (schémas Zod, codes d'erreur, contrat des sockets, moteur de leçon), `packages/ui` ;
   `content/` pour les leçons en JSON.
4. **Le backend (60 s)** : modules Nest par domaine ; pipeline global dans `configureApp` :
   préfixe `/api`, sessions Redis, pipe Zod, filtre de codes d'erreur, Swagger ; deux
   guards globaux : throttler et `AuthGuard`, privé par défaut ; Prisma 7 avec 10 tables
   et 13 migrations ; verrou `FOR UPDATE` sur le cours pour la concurrence.
5. **Sécurité (45 s)** : argon2id, sessions régénérées, cookie `httpOnly` `SameSite=Lax`,
   2FA TOTP avec codes de secours, throttler sur le login, validation double avec le même schéma.
6. **Temps réel (30 s)** : Socket.IO sur `/ws`, authentifié par le même cookie, rooms par
   utilisateur, événements après commit ; présence comptée dans Redis.
7. **Qualité et ops (30 s)** : ~1 900 tests unitaires, Supertest sur vraie base, Playwright
   sur 3 navigateurs avec une « console gate » ; 4 workflows CI ; images multi-arch ;
   Prometheus, Grafana, alertes Discord ; déploiement par timer systemd.

## C. Présentation détaillée en 10 minutes

Reprendre B, puis ajouter quatre démonstrations commentées (≈ 1 min 15 chacune) :

1. **Inscription → onboarding** : montrer la validation instantanée (même schéma Zod),
   puis la réponse `409` si l'e-mail est pris (code traduit). Ouvrir `/api/docs`.
2. **Placement** : expliquer la dichotomie (B1, 2 questions par catégorie, 1 erreur
   tolérée), la session dans Redis avec verrou, le chrono serveur, le fait que la bonne
   réponse n'est jamais envoyée, le regarnissage par LLM en arrière-plan.
3. **Une leçon de grammaire** : page par page ; ouvrir les outils réseau pour montrer que la
   réponse ne contient ni clés ni ids (réfs HMAC) ; examen chronométré ; score 35/65 ;
   refaire une page → `409 attempt.stale`. Deux onglets : l'autre se met à jour.
4. **Social** : deux navigateurs, demande d'ami, acceptation, point vert qui s'allume ;
   fermer un onglet : le point s'éteint 10 secondes après.

Finir par **l'état honnête** (30 s) : « Le chat, le RAG et l'affichage de l'XP ne sont pas
faits ; trois types de leçon sur quatre sont prêts côté serveur mais pas encore jouables
dans l'interface. »

---

## D. Questions techniques difficiles (48)

### Architecture

**1. Pourquoi deux applications serveur au lieu d'une ?**
- Réponse : Next pour le rendu serveur et l'i18n ; Nest pour la logique, avec DI, guards, Swagger, WebSockets.
- Pourquoi : séparer présentation et métier ; une seule porte vers les données.
- Fichiers : `docs/ARCHITECTURE.md` §1, `apps/web/package.json` (pas de Prisma).
- À l'oral : « Next ne fait qu'afficher. Si demain on fait une appli mobile, elle parle à la même API. »

**2. Comment Next appelle-t-il l'API pendant le SSR, et avec quelle identité ?**
- Réponse : `fetch('http://api:3001/api/...')` en recopiant les cookies et `x-forwarded-for`.
- Pourquoi : même session, mêmes règles que le navigateur, sans quitter Docker.
- Fichiers : `apps/web/lib/api.ts` (`fetchWithRequestHeaderAndIP`).
- À l'oral : « Le serveur Next se comporte comme le navigateur de l'utilisateur : il présente son cookie. »

**3. Pourquoi pas de CORS ?**
- Réponse : pages, API et WebSocket sont sur la même origine grâce à Caddy.
- Fichiers : `infra/caddy/Caddyfile`.
- À l'oral : « Le navigateur ne voit qu'un seul site. »

**4. Que se passe-t-il si l'API est arrêtée ?**
- Réponse : les pages serveur reçoivent `unavailable` et lèvent une erreur (page `error.tsx`) ; le socket passe en « Reconnexion… » et sonde `/healthz/api` ; le monitoring alerte (`ApiDown`, `WebCannotReachApi`).
- Fichiers : `apps/web/lib/api.ts`, `lib/reconnect.ts`, `infra/monitoring/prometheus/rules/alerts.yml`.

**5. Pourquoi `@ft/shared` contient-il le moteur de leçon si seul le serveur l'exécute ?**
- Réponse : il partage aussi les **types des vues** et les schémas de réponse utilisés par le front ; le moteur est pur (pas de base), donc testable et réutilisable.
- Fichiers : `packages/shared/src/lessons/player/`.
- À l'oral : « Le front a besoin des types de ce que le moteur renvoie ; le code de notation, lui, n'est appelé que par l'API. »

**6. Combien d'instances d'API pouvez-vous lancer ?**
- Réponse : une seule aujourd'hui (présence, throttler, regarnissage en mémoire ; rooms locales).
- Fichiers : commentaires de `presence.service.ts`, `question-stock.service.ts`, `ARCHITECTURE.md` §4.
- À l'oral : « Une, c'est assumé et documenté ; le passage à plusieurs demande l'adaptateur Redis de Socket.IO. »

### Frontend

**7. Server Component ou Client Component : comment choisissez-vous ?**
- Réponse : lire = serveur ; interagir (formulaire, lecteur, socket) = `'use client'`.
- Fichiers : `learn/[lang]/page.tsx` (serveur), `goal-picker.tsx` (client).

**8. Comment la page se met-elle à jour après une écriture ?**
- Réponse : `router.refresh()` relance le rendu serveur ; dans les autres onglets, l'événement `course:updated` fait de même via `RefreshOn`.
- Fichiers : `lib/use-course-save.ts`, `components/refresh-on.tsx`.

**9. Comment fonctionne l'internationalisation ?**
- Réponse : next-intl, segment `[locale]` obligatoire, middleware `proxy.ts`, 3 catalogues de 475 lignes, erreurs traduites par code.
- Fichiers : `apps/web/i18n/*`, `apps/web/messages/*.json`, `lib/error-message.ts`.

**10. Où est l'état global ?**
- Réponse : il n'y en a pas, sauf le socket en variable de module exposé par `useSyncExternalStore`.
- Fichiers : `components/tab-socket.ts`.

**11. Comment évitez-vous les erreurs d'hydratation et les erreurs console ?**
- Réponse : console gate Playwright sur le build de prod ; sonde avant reconnexion du socket ; `suppressHydrationWarning` uniquement sur `<html>`.
- Fichiers : `e2e/support/console-guard.ts`, `app/[locale]/layout.tsx`.

**12. Pourquoi valider les réponses de l'API côté front ?**
- Réponse : pour ne jamais afficher une donnée inattendue ; une réponse invalide devient une erreur gérée.
- Fichiers : `lib/api.ts`, `lib/api-client.ts` (`schema.safeParseAsync`).

### Backend

**13. Comment une route devient-elle publique ?**
- Réponse : décorateur `@Public()` lu par l'`AuthGuard` global.
- Fichiers : `auth/auth.decorators.ts`, `auth/auth.guard.ts`.

**14. Que renvoie une erreur de validation ?**
- Réponse : `400 { statusCode, message: ["code", …] }`.
- Fichiers : `validation.pipe.ts`.

**15. Que se passe-t-il pour une exception non prévue ?**
- Réponse : `ErrorCodeFilter` renvoie `500 server.unexpected` et journalise la pile.
- Fichiers : `error-code.filter.ts`.

**16. Comment l'injection de dépendances vous sert-elle concrètement ?**
- Réponse : `LLM_PROVIDER` est un jeton ; la fabrique choisit Gemini ou la fixture ; les tests injectent des doublures.
- Fichiers : `llm/llm.module.ts`, `llm/llm.factory.ts`.

**17. Comment gérez-vous deux fins de leçon simultanées ?**
- Réponse : transaction + `SELECT … FOR UPDATE` sur `UserLevel` ; la seconde attend puis relit.
- Fichiers : `lessons/goal.ts` (`lockCourse`).

**18. Pourquoi les événements socket sont-ils envoyés après la transaction ?**
- Réponse : sinon un autre onglet pourrait lire l'ancienne valeur ou une valeur annulée.
- Fichiers : `courses/courses.service.ts`, `lessons/attempts.service.ts`.

### Base de données

**19. Quelle table représente un cours ?**
- Réponse : `UserLevel`, unique par `(userId, lang)`.
- Fichiers : `schema.prisma`.

**20. Pourquoi `LessonResult` a une clé composite ?**
- Réponse : une ligne par (cours, leçon) ; refaire met à jour avec le meilleur score.
- Fichiers : `schema.prisma`, `roadmap.rules.ts` (`merge`).

**21. Comment évitez-vous les doublons d'amitié ?**
- Réponse : `pairKey` = ids triés, clé primaire.
- Fichiers : `friends/pair.ts`.

**22. Comment le contenu arrive-t-il en base ?**
- Réponse : `make seed` → `seed.ts` : upsert de 3 990 leçons, validation, `ready` pour 216.
- Fichiers : `apps/api/prisma/seed.ts`.

**23. Comment versionnez-vous le schéma ?**
- Réponse : 13 migrations Prisma ; `migrate deploy` en prod ; CI vérifie l'absence de dérive.
- Fichiers : `prisma/migrations/`, `scripts/check-prisma-drift.sh`.

**24. Pourquoi Redis en plus de Postgres ?**
- Réponse : données éphémères à expiration : sessions, test de placement + verrou, présence.
- Fichiers : `app.setup.ts`, `placement-session.service.ts`, `presence.service.ts`.

### Authentification

**25. JWT ou sessions ?**
- Réponse : sessions serveur dans Redis, cookie opaque.
- Pourquoi : révocation immédiate.
- À l'oral : « Une déconnexion est vraiment une déconnexion. »

**26. Comment stockez-vous les mots de passe ?**
- Réponse : argon2id, paramètres OWASP, sel inclus.
- Fichiers : `auth/auth.service.ts`.

**27. Comment fonctionne votre 2FA ?**
- Réponse : TOTP (6 chiffres, 30 s, ±1 pas), activation après un premier code valide, 10 codes de secours SHA-256 à usage unique, désactivation sous mot de passe.
- Fichiers : `auth/two-factor.service.ts`.

**28. Pourquoi le login avec 2FA renvoie 202 ?**
- Réponse : identifiants acceptés mais connexion non terminée ; pas d'utilisateur dans le corps.
- Fichiers : `auth/auth.controller.ts`.

**29. Qu'est-ce que la fixation de session et comment l'évitez-vous ?**
- Réponse : imposer un id de session connu à la victime ; on régénère l'id à chaque changement de privilège.
- Fichiers : `auth.controller.ts` (`regenerate`).

**30. Un utilisateur supprimé garde-t-il l'accès ?**
- Réponse : non, l'`AuthGuard` relit l'utilisateur à chaque requête et détruit la session.
- Fichiers : `auth.guard.ts`.

### Communication

**31. Comment le socket est-il authentifié ?**
- Réponse : `SessionIoAdapter` branche `express-session` sur engine.io ; vérif Origin, `userId`, compte, ≤ 20 sockets.
- Fichiers : `gateway/session-io.adapter.ts`, `gateway/socket.gateway.ts`.

**32. Quels événements existent ?**
- Réponse : `course:updated`, `friend:request|accepted|removed`, `presence:update`, `app:error`. Aucun du client.
- Fichiers : `packages/shared/src/events/socket.ts`.

**33. Comment fonctionne la présence ?**
- Réponse : compteur Redis par utilisateur, grâce de 10 s, amis acceptés seulement, instantané à la connexion, remise à zéro au démarrage.
- Fichiers : `presence/presence.service.ts`.

**34. Comment gérez-vous la reconnexion ?**
- Réponse : backoff 1-2-4-8-10 s avec aléa, sonde `/healthz/api` avant de recomposer, refresh à la reconnexion.
- Fichiers : `lib/reconnect.ts`, `components/tab-socket.ts`.

### Infrastructure

**35. Que fait `make` ?**
- Réponse : CI locale → pile de prod → migrations + seed → certificat → monitoring-check → Playwright.
- Fichiers : `Makefile` (`all`, `run`, `ci`).

**36. Pourquoi Caddy ?**
- Réponse : TLS automatique (CA interne en local, ACME en prod), configuration courte, HTTP/3.
- Fichiers : `infra/caddy/Caddyfile*`.

**37. Comment déployez-vous ?**
- Réponse : images multi-arch sur GHCR à chaque push ; sur la VM, un timer systemd toutes les 5 min tire les images, migre et relance.
- Fichiers : `.github/workflows/images.yml`, `infra/deploy/deploy.sh`.

**38. Que surveillez-vous ?**
- Réponse : disponibilité, erreurs et latence de l'API, event loop, Postgres, Redis, hôte, échecs de connexion, LLM, regarnissage, banque épuisée ; 25 alertes vers Discord.
- Fichiers : `infra/monitoring/prometheus/rules/alerts.yml`, `apps/api/src/metrics/metrics.ts`.

### Sécurité

**39. Comment l'upload d'avatar est-il sécurisé ?**
- Réponse : 3 types MIME, 2 Mio, vérification des octets magiques, nom UUID, le client ne peut pas choisir le chemin.
- Fichiers : `users/users.controller.ts`, `schemas/user.ts` (`UpdateProfileSchema` sans `avatarUrl`).

**40. Comment empêchez-vous l'énumération des comptes ?**
- Réponse : même erreur, et vérification argon2 factice pour un e-mail inconnu.
- Fichiers : `auth.service.ts` (`DUMMY_HASH`).

**41. Comment l'apprenant pourrait-il tricher sur une leçon, et pourquoi ne peut-il pas ?**
- Réponse : il ne reçoit ni clés ni ids ; l'ordre dépend de HMAC ; pas de route de score ; deadline serveur ; une page soumise une fois.
- Fichiers : `lessons/attempt-ref.ts`, `shared/lessons/player/redact.ts`, `attempt.ts`.

**42. Comment sont gérés les secrets ?**
- Réponse : `.env` ignoré, `.env.example`, gitleaks, démarrage refusé si `SESSION_SECRET` < 32.
- Fichiers : `.env.example`, `app.setup.ts`, `hygiene.yml`.

### Fonctionnalités

**43. Comment est calculé le plan du jour ?**
- Réponse : cible = objectif/10 ; non réussies d'abord dans l'ordre, puis réussies les plus anciennes ; 3 en plus.
- Fichiers : `lessons/roadmap.rules.ts` (`queue`, `plan`).

**44. Comment marche la série ?**
- Réponse : atteindre la cible un jour ; continue si la veille était atteinte, sinon repart à 1 ; jour dans le fuseau de l'utilisateur, jamais en arrière.
- Fichiers : `roadmap.rules.ts` (`metOn`, `courseDay`).

**45. Où intervient l'IA en production ?**
- Réponse : uniquement pour regarnir la banque de questions de placement (Gemini, JSON structuré), en arrière-plan.
- Fichiers : `question-generation/question-stock.service.ts`, `llm/gemini.provider.ts`.

**46. Quelle gamification avez-vous ?**
- Réponse : XP (10/leçon + amélioration, 20 objectif, 30 défi), rangs, défi du jour déterministe, 16 succès ; affichage : série seulement.
- Fichiers : `lessons/gamification*.ts`, `shared/schemas/gamification.ts`.

### Choix techniques

**47. Pourquoi Zod plutôt que class-validator ?**
- Réponse : partager le schéma avec le navigateur.

**48. Pourquoi un monorepo ?**
- Réponse : contrat partagé sans publication, une CI, changements atomiques.

---

## E. Questions pièges

| Question | Le piège | Bonne réponse |
|---|---|---|
| « Montrez-moi votre chat. » | Il n'existe pas. | « La page `/chat` est une maquette. Le temps réel existe, mais pas le chat ; c'est le ticket #158. » |
| « Où est votre RAG ? » | pgvector est installé. | « Nulle part : l'extension est dans l'image, aucune table ni requête ne l'utilise. » |
| « Vous utilisez des JWT, non ? » | Réflexe courant. | « Non, des sessions serveur dans Redis. » |
| « Le score est calculé dans le navigateur ? » | | « Non, aucune route n'accepte un score. » |
| « Le front lit la base pour le SSR ? » | | « Non, il appelle l'API sur le réseau Docker. » |
| « Votre WebSocket reçoit des messages du client ? » | | « Non, `CLIENT_EVENTS` est vide ; le serveur rejette tout événement. » |
| « Pourquoi 4 000 leçons ? » | Le README dit « about 4,000 ». | « 3 990 au syllabus, 216 écrites et prêtes. » |
| « Je peux jouer une leçon de vocabulaire ? » | | « Pas dans le navigateur aujourd'hui : seule la grammaire a ses écrans. L'API sait les jouer. » |
| « Votre admin, il peut faire quoi ? » | `Role.ADMIN` existe. | « Rien : aucun contrôle de rôle n'est appliqué. » |
| « Le chrono de l'examen est en JavaScript ? » | | « Le compte à rebours oui, mais la deadline est en base ; une page en retard est comptée vide. » |
| « `trust proxy: true` serait plus simple ? » | | « Non : un client pourrait falsifier son IP et contourner le throttler. » |
| « Votre throttler résiste à un redémarrage ? » | | « Non, il est en mémoire. » |
| « Les questions de placement ne se répètent jamais ? » | | « Jamais dans un même test ; entre deux tests, seulement si la banque est épuisée, en commençant par la plus ancienne vue. » |
| « Pourquoi SHA-256 pour les codes de secours, c'est faible ? » | | « Ils sont aléatoires et longs : rien à deviner, et on peut les chercher par index. » |

## F. Tes points faibles potentiels

1. **Le moteur de leçon** (`packages/shared/src/lessons/player`) : beaucoup de fichiers et de
   vocabulaire (plan, page, unité, item, réf, curseur). Révise [09 F6](09-BUSINESS-FEATURES.md#f6--jouer-une-leçon-le-moteur-de-tentative) et dessine le flux 4.
2. **La différence entre les deux clients HTTP du front** (`api.ts` vs `api-client.ts`).
3. **Le placement** : savoir dérouler la dichotomie sur un exemple (B1 → B2 ou A2…).
4. **Les modules du sujet** : connaître le décompte honnête des points (module 01).
5. **La présence** : la grâce de 10 s et la remise à zéro au démarrage sont subtiles.
6. **Prisma 7** : adaptateur obligatoire, URL dans `prisma.config.ts`, client généré dans `src/`.
7. **La CI** : 4 workflows, savoir dire lequel fait quoi.
8. **Ta propre contribution** : le sujet exige que chaque membre l'explique. Prépare 3 PR
   que tu as faites ou relues (`git log --author=<toi>`).
