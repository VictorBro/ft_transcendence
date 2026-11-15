# 18 · Les fichiers importants

Les 36 fichiers qui permettent de comprendre l'application, par ordre de lecture conseillé.

## Vue d'ensemble

| # | Fichier | Pourquoi il compte |
|---|---|---|
| 1 | `README.md` | Présentation officielle, équipe, commandes de lancement |
| 2 | `docs/ARCHITECTURE.md` | Conteneurs, routage, temps réel : la référence de l'équipe |
| 3 | `docs/PRODUCT_ARCHITECTURE.md` | Parcours apprenant, modules visés, IA, transport REST/WS |
| 4 | `Makefile` | La commande unique `make` et toutes les autres |
| 5 | `compose.yml` | Les 12 services, réseau, volumes |
| 6 | `infra/caddy/Caddyfile` | Porte d'entrée HTTPS et routage par chemin |

## Backend

| # | Fichier | Pourquoi il compte |
|---|---|---|
| 7 | `apps/api/src/main.ts` | Démarrage, port 3001, serveur de métriques |
| 8 | `apps/api/src/app.setup.ts` | Le pipeline global : préfixe, sessions Redis, cookie, pipe, filtre, WebSocket, Swagger |
| 9 | `apps/api/src/app.module.ts` | La carte des modules et le throttler global |
| 10 | `apps/api/src/validation.pipe.ts` | Validation Zod et format des erreurs |
| 11 | `apps/api/src/error-code.filter.ts` | Garantit qu'aucune réponse ne contient une phrase |
| 12 | `apps/api/src/auth/auth.controller.ts` | Inscription, connexion, 2FA, déconnexion, régénération de session |
| 13 | `apps/api/src/auth/auth.service.ts` | argon2id, hash factice, `SessionUser` |
| 14 | `apps/api/src/auth/auth.guard.ts` | Privé par défaut, relit l'utilisateur |
| 15 | `apps/api/src/auth/two-factor.service.ts` | TOTP et codes de secours |
| 16 | `apps/api/src/courses/courses.service.ts` | Créer un cours, objectif, niveau, événement après commit |
| 17 | `apps/api/src/placement/placement.service.ts` + `placement-progress.service.ts` | Le test adaptatif |
| 18 | `apps/api/src/question-generation/question-stock.service.ts` | Regarnissage par le LLM |
| 19 | `apps/api/src/llm/llm.factory.ts` | Choix Gemini / fixture |
| 20 | `apps/api/src/lessons/lessons.service.ts` | Aujourd'hui, liste, `applyFinish` |
| 21 | `apps/api/src/lessons/attempts.service.ts` | Jouer une leçon côté serveur |
| 22 | `apps/api/src/lessons/roadmap.rules.ts` | Plan du jour, série, réussite, niveau terminé |
| 23 | `apps/api/src/lessons/goal.ts` | `lockCourse`, `meetGoal` |
| 24 | `apps/api/src/lessons/gamification.rules.ts` | XP, rangs, défi, succès |
| 25 | `apps/api/src/friends/friends.service.ts` | Amitiés et notifications |
| 26 | `apps/api/src/gateway/socket.gateway.ts` | Poignée de main, garde-fous, présence |
| 27 | `apps/api/src/presence/presence.service.ts` | Compteur Redis, grâce de 10 s |
| 28 | `apps/api/prisma/schema.prisma` | Le modèle de données |
| 29 | `apps/api/prisma/seed.ts` | Chargement et validation du contenu |

## Partagé

| # | Fichier | Pourquoi il compte |
|---|---|---|
| 30 | `packages/shared/src/schemas/user.ts` | Règles d'inscription, de profil (le même schéma front/back) |
| 31 | `packages/shared/src/events/socket.ts` | Le contrat temps réel |
| 32 | `packages/shared/src/lessons/player/attempt.ts` (+ `score.ts`, `redact.ts`) | Le moteur de leçon |

## Frontend

| # | Fichier | Pourquoi il compte |
|---|---|---|
| 33 | `apps/web/lib/api.ts` + `apps/web/lib/api-client.ts` | Les deux chemins vers l'API |
| 34 | `apps/web/components/tab-socket.ts` | Le socket de l'onglet, reconnexion, présence |
| 35 | `apps/web/app/[locale]/(dashboard)/learn/[lang]/page.tsx` | La page principale « aujourd'hui » |
| 36 | `apps/web/app/[locale]/(dashboard)/learn/[lang]/lessons/[id]/play/player.tsx` | Le lecteur de leçon |

## Le graphe Understand Anything

Le dossier `.ua/` à la racine contient la cartographie produite avec le plugin
[Understand Anything](https://github.com/Egonex-AI/Understand-Anything) :

| Fichier | Contenu |
|---|---|
| `.ua/knowledge-graph.json` | Le graphe : un nœud par fichier (et par fonction/classe significative), les arêtes `imports`, `calls`, `contains`, `tested_by`…, les couches d'architecture et une visite guidée, en français |
| `.ua/domain-graph.json` | La vue métier (domaines, flux, étapes), si présente |
| `.ua/config.json` | `{"language":"fr"}` |
| `.ua/.understandignore` | Ce qui a été exclu (contenu pédagogique JSON, maquettes, marque, lockfile) |

Le graphe sert à **explorer** (qui importe quoi, où est testée une fonction). Ses résumés
sont générés par IA : **le cours prime**, car il a été vérifié dans le code. Pour ouvrir le
tableau de bord interactif, voir [README.md](README.md#le-graphe-understand-anything).
