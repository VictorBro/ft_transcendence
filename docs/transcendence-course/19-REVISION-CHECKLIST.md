# 19 · Check-list de révision

Coche quand tu peux le faire **sans notes, à voix haute**.

## La veille : vérifier le projet

- [ ] `cp .env.example .env` puis `make` passent **jusqu'au bout** sur ma machine (pas vérifiable dans l'environnement où ce cours a été écrit).
- [ ] J'ai ouvert `https://localhost`, `https://localhost/api/docs`, `https://localhost/grafana`.
- [ ] J'ai un compte de démo prêt (`DEMO_PASSWORD` dans `.env`) ou je sais en créer un en 30 s.
- [ ] J'ai une leçon de **grammaire** prête à jouer pour la démo.
- [ ] Les TODO du `README.md` (logins, organisation, communication) sont remplis.
- [ ] Je connais ma propre contribution : 3 PR que je peux expliquer.

## Comprendre le projet

- [ ] Je présente le projet en 2 minutes ([15 A](15-ORAL-EXAM-PREPARATION.md#a-présentation-du-projet-en-2-minutes)).
- [ ] Je donne la règle d'architecture en une phrase.
- [ ] Je sais ce qui est **fini, partiel, absent** (chat, RAG, XP non affichée, 1 type de leçon jouable sur 4, pas de page de recherche).

## Stack et architecture

- [ ] Je cite la stack avec les versions majeures (Next 16, React 19, Nest 11, Prisma 7, Postgres 18, Redis 8, Socket.IO 4, Caddy 2).
- [ ] Je dessine le schéma des conteneurs et le routage de Caddy.
- [ ] J'explique les deux chemins vers l'API (SSR et navigateur).
- [ ] J'explique pourquoi il n'y a pas de CORS.

## Frontend

- [ ] Server vs Client Components, avec un exemple de chaque chez nous.
- [ ] Le parcours « changer l'objectif » du clic à l'affichage, autres onglets compris.
- [ ] Comment une erreur de l'API devient un message traduit.
- [ ] Le routing `[locale]`, les route groups, `proxy.ts`.

## Backend

- [ ] Le pipeline d'une requête (middlewares, guards, pipes, contrôleur, service, filtre).
- [ ] Privé par défaut et `@Public()`.
- [ ] Les limites de débit (100/min, 10 signup, 5 login/2FA, 10 demandes d'ami).
- [ ] `lockCourse` et pourquoi.

## Base de données

- [ ] Je dessine l'ERD (10 tables) et je cite les clés particulières (`pairKey`, PK composites, `@@unique([userId, lang])`).
- [ ] La vie d'un `LessonResult`.
- [ ] Ce que fait le seed (3 990 leçons, 216 prêtes, 270 questions).

## Authentification

- [ ] Sessions vs JWT, et notre choix.
- [ ] Connexion avec 2FA : `202`, `pendingUserId`, `verify`, régénération.
- [ ] Les défenses : argon2id, hash factice, throttler, `httpOnly`, `SameSite=Lax`, régénération, relecture de l'utilisateur.

## Fonctionnalités

- [ ] Dérouler le placement sur un exemple.
- [ ] Expliquer pourquoi on ne peut pas tricher sur une leçon.
- [ ] Le calcul du score (35/65, 0,5 pour l'orthographe, 70 pour réussir).
- [ ] La série et le fuseau horaire.
- [ ] L'XP, les rangs, le défi, les succès (et leur non-affichage).
- [ ] Où intervient l'IA (regarnissage + écriture hors ligne).

## Temps réel

- [ ] La poignée de main authentifiée.
- [ ] Les 6 événements et leurs destinataires.
- [ ] La présence (compteur, 10 s, amis acceptés).
- [ ] La reconnexion sans erreur console.

## Infra, tests, choix

- [ ] Ce que fait `make`, étape par étape.
- [ ] Les 4 fichiers Compose, les 4 workflows.
- [ ] Le déploiement par timer systemd.
- [ ] Les 3 niveaux de tests, la console gate.
- [ ] 3 choix techniques défendus **avec leurs inconvénients**.

## Le jour J

- [ ] J'ai fait au moins 2 examens blancs ([16](16-MOCK-EXAM.md)), dont un de niveau 5.
- [ ] Je relis [15 E](15-ORAL-EXAM-PREPARATION.md#e-questions-pièges) (questions pièges) le matin.
- [ ] Si je ne sais pas : « Je ne suis pas sûr, je vérifie dans le code » et j'ouvre le fichier.
