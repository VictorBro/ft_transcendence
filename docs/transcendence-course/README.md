# Cours : maîtriser NOTRE ft_transcendence

Ce dossier est ton support de révision. Il explique **notre** projet, celui qui est
dans ce dépôt, et rien d'autre. Chaque affirmation importante renvoie au code.

> **Ce qu'il faut savoir avant tout.** Notre Transcendence **n'est pas un Pong**.
> C'est une **plateforme d'apprentissage des langues** (anglais, français, allemand) :
> un test de placement adaptatif te donne un niveau CECRL (A1 → C2), puis tu fais
> chaque jour des leçons de quatre types, avec exercices, examen chronométré et score.
> Si tu ne retiens qu'une phrase pour le jury, c'est celle de l'architecture :
> **« NestJS possède toute la logique métier et l'accès aux données ; Next.js ne fait
> que la présentation et le rendu serveur. »** (`docs/ARCHITECTURE.md` §1)

---

## Par où commencer

1. Lis [00-COURSE-ROADMAP.md](00-COURSE-ROADMAP.md) (5 min) : l'ordre et le temps à prévoir.
2. Lis [01-PROJECT-INTRODUCTION.md](01-PROJECT-INTRODUCTION.md) : la vision d'ensemble.
3. Suis ensuite les modules dans l'ordre de la feuille de route.
4. Termine chaque module par sa section **Auto-évaluation** sans regarder les corrections.
5. Quand tu te sens prêt, fais un examen blanc avec moi (voir plus bas).

## Les modules

| Fichier | Module du programme | Priorité jury |
|---|---|---|
| [01-PROJECT-INTRODUCTION.md](01-PROJECT-INTRODUCTION.md) | 00 · Introduction | ★★★ |
| [02-TECH-STACK.md](02-TECH-STACK.md) | 01 · Stack technique | ★★★ |
| [03-GLOBAL-ARCHITECTURE.md](03-GLOBAL-ARCHITECTURE.md) | 02 · Architecture globale | ★★★ |
| [04-CODEBASE-STRUCTURE.md](04-CODEBASE-STRUCTURE.md) | 03 · Structure du code | ★★ |
| [05-FRONTEND.md](05-FRONTEND.md) | 04 · Frontend | ★★★ |
| [06-BACKEND.md](06-BACKEND.md) | 05 · Backend | ★★★ |
| [07-DATABASE.md](07-DATABASE.md) | 06 · Base de données | ★★★ |
| [08-AUTHENTICATION-AND-SECURITY.md](08-AUTHENTICATION-AND-SECURITY.md) | 07 · Auth et sécurité | ★★★ |
| [09-BUSINESS-FEATURES.md](09-BUSINESS-FEATURES.md) | 08 · Fonctionnalités métier | ★★★ |
| [10-REALTIME-AND-COMMUNICATION.md](10-REALTIME-AND-COMMUNICATION.md) | 09 · Temps réel | ★★★ |
| [11-INFRASTRUCTURE-AND-DEPLOYMENT.md](11-INFRASTRUCTURE-AND-DEPLOYMENT.md) | 10 · Infra et déploiement | ★★ |
| [12-END-TO-END-FLOWS.md](12-END-TO-END-FLOWS.md) | 11 · Flux complets | ★★★ |
| [13-TESTING-AND-QUALITY.md](13-TESTING-AND-QUALITY.md) | 12 · Tests et qualité | ★★ |
| [14-TECHNICAL-DECISIONS.md](14-TECHNICAL-DECISIONS.md) | 13 · Choix techniques | ★★★ |
| [15-ORAL-EXAM-PREPARATION.md](15-ORAL-EXAM-PREPARATION.md) | Préparation soutenance | ★★★ |
| [16-MOCK-EXAM.md](16-MOCK-EXAM.md) | Examen blanc interactif | ★★ |
| [17-GLOSSARY.md](17-GLOSSARY.md) | 14 · Glossaire | ★ (référence) |
| [18-IMPORTANT-FILES.md](18-IMPORTANT-FILES.md) | Les fichiers à connaître | ★★ (référence) |
| [19-REVISION-CHECKLIST.md](19-REVISION-CHECKLIST.md) | Check-list finale | ★★★ |
| [diagrams/](diagrams/) | Tous les schémas Mermaid regroupés | ★★ |

Le numéro de fichier est décalé de 1 par rapport au numéro de module de ta demande
(le « Module 00 » est le fichier `01-…`), parce que `00-` est la feuille de route.

## Les sujets les plus importants

Si tu manques de temps, maîtrise d'abord ces six sujets. Ce sont ceux qu'un jury
creuse, et ceux où notre projet a des choix originaux à défendre :

1. **La règle d'architecture** : Next.js = présentation, NestJS = métier + données,
   et pourquoi un seul domaine (`https://localhost`) derrière Caddy supprime le CORS.
2. **L'authentification par session** (pas de JWT) : cookie `ft.sid` httpOnly, sessions
   dans Redis, argon2id, 2FA TOTP, régénération de l'id de session.
3. **Le contrat partagé** `packages/shared` : un même schéma Zod valide le formulaire
   et l'endpoint ; les erreurs sont des **codes** traduits par le navigateur.
4. **Le lecteur de leçon côté serveur** : le serveur garde les réponses, ne renvoie que
   la page courante, masque les identifiants par HMAC, chronomètre l'examen, calcule le score.
5. **Le temps réel** : Socket.IO sur `/ws`, authentifié par le même cookie, rooms
   `user:<id>`, événements après commit, présence comptée dans Redis.
6. **L'état réel du projet** : ce qui est fini, ce qui est partiel (chat, RAG, 3 types de
   leçon sur 4 non jouables dans l'UI). Un jury apprécie qu'on le sache. Voir
   [01 §« État réel »](01-PROJECT-INTRODUCTION.md#état-réel-du-projet-ce-qui-est-fini-et-ce-qui-ne-lest-pas).

## Les statuts de fiabilité

Chaque affirmation technique importante porte un statut :

| Statut | Signification |
|---|---|
| **[CONFIRMED]** | Vérifié en lisant le code ou en exécutant une commande. |
| **[INFERRED]** | Déduit du code, mais pas observé directement (ex. comportement d'une librairie). |
| **[UNVERIFIED]** | Pas pu vérifier dans cet environnement (ex. pas de Docker ici). |
| **[NOT PRESENT]** | Absent du projet, même si la doc ou l'UI le laisse croire. |

Ce qui a été exécuté pour construire ce cours (le 15/11/2026, commit `477b3d4`) :

- `pnpm install --frozen-lockfile` puis `pnpm run test` : **1 919 tests unitaires verts**
  (api 1 184, shared 435, web 290, ui 10). [CONFIRMED]
- Un passage « à blanc » du seed (`seedLessons` avec une fausse base) : **3 990 leçons**
  au catalogue, **216 prêtes** (72 par langue). [CONFIRMED]
- **Pas** de démon Docker dans cet environnement : `make`, les tests e2e de l'API
  (Supertest + Postgres + Redis) et Playwright n'ont **pas** été lancés ici. [UNVERIFIED]

## Le graphe Understand Anything

Le dépôt contient maintenant `.ua/` : la cartographie produite avec le plugin
Understand Anything (voir [18-IMPORTANT-FILES.md](18-IMPORTANT-FILES.md#le-graphe-understand-anything)).
Il sert d'outil d'exploration ; **le cours, lui, s'appuie sur le code**, pas sur les
résumés générés.

| Artefact | Contenu |
|---|---|
| `.ua/knowledge-graph.json` | 1 368 nœuds (481 fichiers, 675 fonctions, 92 classes, 10 tables…), 3 461 arêtes, 13 couches, visite guidée de 13 étapes, en français |
| `.ua/domain-graph.json` | 6 domaines métier, 12 flux, 29 étapes |
| `.ua/fingerprints.json`, `.ua/meta.json`, `.ua/intermediate/scan-result.json` | ce qu'il faut pour une mise à jour incrémentale (`/understand` après de nouveaux commits) |

Comment il a été produit (le 15/11/2026, commit `477b3d4`) : les commandes `/plugin`
ne sont pas utilisables dans une session cloud, donc le plugin a été cloné et construit
à la main (`~/.understand-anything-plugin`), puis le pipeline `/understand --language fr`
a été exécuté phase par phase : scan et imports (scripts du plugin), 38 lots analysés
par des agents `file-analyzer`, fusion (`merge-batch-graphs.py`), couches, visite et
graphe métier écrits à partir du code vérifié, validation (0 référence cassée),
empreintes. Le contenu pédagogique JSON (`content/`), les maquettes et la marque sont
exclus (`.ua/.understandignore`).

Pour ouvrir le tableau de bord sur ta machine, avec le plugin installé dans Claude Code :

```text
/understand-dashboard
```

Ou sans le plugin, depuis un clone de `Egonex-AI/Understand-Anything` construit
(`pnpm install` puis `pnpm --filter @understand-anything/core build`) :

```bash
cd understand-anything-plugin/packages/dashboard && GRAPH_DIR=/chemin/vers/ft_transcendence npx vite --host 127.0.0.1
```

puis ouvre l'URL `http://127.0.0.1:5173/?token=…` affichée dans le terminal (vue
« Structural » pour les couches, « Domain » pour les flux métier, « Learn » pour la visite).
Les commandes interactives `/understand-chat` et `/understand-explain <fichier>`
fonctionnent sur ce même graphe.

## Comment réviser

- **Une passe de compréhension** : lis un module, ouvre les fichiers cités à côté.
- **Une passe active** : fais le mini-exercice, puis l'auto-évaluation, puis compare.
- **Une passe orale** : prends les « Questions possibles à l'oral » et réponds à voix
  haute, sans lire. Chronomètre-toi : une réponse orale tient en 30 à 60 secondes.
- **Les deux derniers jours** : [15-ORAL-EXAM-PREPARATION.md](15-ORAL-EXAM-PREPARATION.md)
  et [19-REVISION-CHECKLIST.md](19-REVISION-CHECKLIST.md).

## Lancer un examen blanc avec moi

Écris simplement, dans une session Claude Code ouverte sur ce dépôt :

```text
Lance un examen blanc de niveau 2 en suivant docs/transcendence-course/16-MOCK-EXAM.md
```

Je poserai **une seule question**, j'attendrai ta réponse, je la corrigerai (ce qui est
juste, ce qui est faux, la réponse idéale, ce qu'il faut revoir), puis je passerai à la
suivante. Tu peux préciser un thème : « niveau 3, uniquement le temps réel ».
