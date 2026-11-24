# ft_transcendence : résumé du sujet

Condensé de `ft_transcendence.pdf` (sujet 42, version 21.2, 32 pages).
C'est une référence de travail : le PDF reste la seule autorité.

## Le projet

Dernier projet du Common Core, **groupe de 4 à 5 personnes**. Le contenu est _ton_ choix : n'importe quelle app web réaliste.
Divisé en un **tronc obligatoire** + des **modules**.

## Rôles dans l'équipe (obligatoires)

- **Product Owner (PO)** : vision du produit, backlog, priorités, valide le travail, parle aux parties prenantes.
- **Project Manager / Scrum Master** : réunions, planning, suivi de l'avancement, risques et blocages.
- **Technical Lead / Architect** : architecture, choix de la stack, qualité du code, relit les changements critiques.
- **Developers** (tous les membres) : codent les fonctionnalités, relisent le code, testent, documentent.

À 4 personnes, une personne peut avoir plusieurs rôles. Tous les rôles doivent être écrits dans le
README, et chaque membre doit pouvoir expliquer le projet et sa propre contribution
pendant l'évaluation.

Recommandé (pas obligatoire) : points réguliers, suivi des tâches (GitHub Issues / Trello),
découpage du travail, revue de code entre pairs, notes de décision, un canal de discussion.

## Partie obligatoire

- App web avec **frontend + backend + base de données**.
- Git avec des commits de **tous** les membres, des messages clairs, une répartition du travail visible.
- **Conteneurisée** (Docker / Podman / équivalent), lancée avec une **seule commande**.
- Compatible avec la dernière version stable de **Google Chrome**.
- **Aucune erreur ni warning JS** dans la console du navigateur.
- Des pages **Privacy Policy** (politique de confidentialité) et **Terms of Service** (conditions d'utilisation)
  accessibles : vrai contenu, faciles à trouver (par exemple des liens dans le footer). Pages absentes ou
  bouche-trous = **projet refusé**.
- **Plusieurs utilisateurs en même temps** : connexions simultanées, actions simultanées gérées
  correctement, mises à jour en temps réel propagées, pas de corruption de données ni de race conditions.

### Exigences techniques

- Frontend clair, responsive, accessible sur tous les appareils.
- Un framework CSS ou une solution de style (Tailwind, Bootstrap, MUI, Styled Components, …).
- Les identifiants dans un `.env` local ignoré par Git, plus un `.env.example` commité.
- Base de données avec un schema clair et des relations bien définies.
- **Gestion des utilisateurs** de base : inscription + connexion, au minimum email/mot de passe avec
  des mots de passe **hashés et salés**. OAuth / 2FA viennent des modules.
- Tous les formulaires et champs validés **côté frontend et côté backend**.
- **HTTPS** pour chaque connexion au backend depuis l'extérieur. Le trafic interne de container à
  container (par exemple serveur ↔ base de données) peut ne pas être chiffré.

> Définition d'un framework utilisée par le sujet : architecture structurée + fonctionnalités intégrées +
> écosystème complet. React, Vue, Angular, Svelte, Next.js sont des frameworks ; Express, Fastify,
> NestJS, Django, Flask, Rails sont des frameworks. jQuery, Lodash, Axios n'en sont **pas**.

## Modules : 14 points requis

**Major = 2 points, Minor = 1 point.** Viser plus de 14 est recommandé, car un module qui
ne marche pas complètement à l'évaluation compte pour **0**.

### Règles de dépendance et de compatibilité

- Les modules de jeu (AI Opponent, Tournament, Game customization, Spectator mode,
  Multiplayer 3+, Add another game) demandent **d'abord au moins un jeu qui marche**.
- Game Statistics demande un jeu.
- Advanced chat demande le chat de base du module "User interaction".
- **Le SSR est incompatible avec le backend blockchain ICP.**

### Web

| Type  | Module                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Framework pour le frontend et le backend (les frameworks full-stack comptent pour les deux)                                              |
| Minor | Framework frontend                                                                                                                       |
| Minor | Framework backend                                                                                                                        |
| Major | Fonctionnalités temps réel via WebSockets ou équivalent (mises à jour entre clients, déconnexion/reconnexion propre, diffusion efficace) |
| Major | Interaction entre utilisateurs : **chat** de base + **profils** + **amis**                                                               |
| Major | API publique : clé d'API sécurisée, limitation de débit, documentation, ≥5 endpoints (GET/POST/PUT/DELETE)                               |
| Minor | ORM pour la base de données                                                                                                              |
| Minor | Système de notifications complet pour toutes les actions de création/modification/suppression                                            |
| Minor | Fonctionnalités collaboratives en temps réel (espaces de travail partagés, édition en direct, …)                                         |
| Minor | Server-Side Rendering (SSR)                                                                                                              |
| Minor | Progressive Web App (fonctionnement hors ligne + installable)                                                                            |
| Minor | Design system sur mesure, ≥10 composants réutilisables, palette, typographie, icônes                                                     |
| Minor | Recherche avancée : filtres, tri, pagination                                                                                             |
| Minor | Upload et gestion de fichiers (plusieurs types, validation des deux côtés, stockage sécurisé, aperçu, progression, suppression)          |

### Accessibilité et internationalisation

| Type  | Module                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------- |
| Major | Conformité complète WCAG 2.1 AA : lecteurs d'écran, navigation au clavier, technologies d'assistance |
| Minor | i18n avec ≥3 langues complètes, sélecteur de langue, tout le texte traduisible                       |
| Minor | Support RTL : ≥1 langue RTL, mise en page entièrement en miroir, passage LTR/RTL sans accroc         |
| Minor | ≥2 navigateurs supplémentaires entièrement supportés, testés, documentés                             |

### Gestion des utilisateurs

| Type  | Module                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Gestion standard des utilisateurs : modification du profil, upload d'avatar (avec un avatar par défaut), amis + statut en ligne, page de profil      |
| Minor | Statistiques de jeu et historique des matchs (**demande un jeu**) : victoires/défaites/classement/niveau, historique 1v1, succès, classement général |
| Minor | Authentification à distance avec OAuth 2.0 (Google, GitHub, 42, …)                                                                                   |
| Major | Permissions avancées : CRUD des utilisateurs, rôles (admin/user/guest/moderator), vues et actions selon le rôle                                      |
| Major | Système d'organisations : créer/modifier/supprimer des organisations, ajouter/retirer des membres, actions limitées à l'organisation                 |
| Minor | 2FA complète                                                                                                                                         |
| Minor | Analyse de l'activité des utilisateurs et tableau de bord                                                                                            |

### Intelligence artificielle

| Type  | Module                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Adversaire IA (**demande un jeu**) : difficile, gagne parfois, humain et pas parfait, gère la personnalisation du jeu, doit pouvoir être expliqué à l'évaluation |
| Major | Système RAG complet sur un gros jeu de données                                                                                                                   |
| Major | Interface LLM complète : génération de texte et/ou d'images, streaming, gestion des erreurs, limitation de débit                                                 |
| Major | Système de recommandation ML : personnalisé, filtrage collaboratif ou basé sur le contenu, s'améliore avec le temps                                              |
| Minor | IA de modération de contenu (modération / suppression / avertissement automatiques)                                                                              |
| Minor | Intégration de la voix / de la parole                                                                                                                            |
| Minor | Analyse de sentiment du contenu des utilisateurs                                                                                                                 |
| Minor | Reconnaissance et étiquetage d'images                                                                                                                            |

### Cybersécurité

| Type  | Module                                                                           |
| ----- | -------------------------------------------------------------------------------- |
| Major | WAF/ModSecurity renforcé + HashiCorp Vault pour les secrets (chiffrés et isolés) |

### Jeu et expérience utilisateur

| Type  | Module                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Jeu web complet, joueurs contre joueurs, règles claires et conditions de victoire/défaite, en 2D ou 3D                                                            |
| Major | Joueurs à distance sur des machines différentes, gestion de la latence et des déconnexions, logique de reconnexion                                                |
| Major | Multijoueur à 3+ joueurs, mécaniques équitables, synchronisation                                                                                                  |
| Major | Un deuxième jeu différent avec historique et matchmaking                                                                                                          |
| Major | Graphismes 3D avancés (Three.js, Babylon.js) : environnement immersif, rendu avancé, performances fluides                                                         |
| Minor | Chat avancé : blocage, invitations à jouer depuis le chat, notifications dans le chat, accès aux profils, historique, indicateurs de frappe et accusés de lecture |
| Minor | Système de tournoi : tableaux, ordre des matchs, matchmaking, inscription et gestion                                                                              |
| Minor | Personnalisation du jeu : power-ups, cartes/thèmes, réglages, valeurs par défaut disponibles                                                                      |
| Minor | Gamification : ≥3 parmi succès / badges / classements / XP / défis du jour / récompenses, sauvegardés, avec un retour visuel                                      |
| Minor | Mode spectateur avec mises à jour en temps réel (chat des spectateurs en option)                                                                                  |

### DevOps

| Type  | Module                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| Major | Gestion des logs ELK (Elasticsearch + Logstash + Kibana), règles de rétention/archivage, accès sécurisé        |
| Major | Monitoring Prometheus + Grafana : exporters, tableaux de bord sur mesure, règles d'alerte, accès sécurisé      |
| Major | Backend en microservices : faiblement couplés, REST ou files de messages, une seule responsabilité par service |
| Minor | Health check et page de statut avec sauvegardes automatiques et reprise après sinistre                         |

### Données et analyse

| Type  | Module                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| Major | Tableau de bord d'analyse avancé : graphiques interactifs, mises à jour en temps réel, export PDF/CSV, plages de dates et filtres |
| Minor | Export/import de données (JSON, CSV, XML), imports validés, opérations en masse                                                   |
| Minor | Conformité RGPD : demandes de données, suppression confirmée, export lisible, emails de confirmation                              |

### Blockchain

| Type  | Module                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Scores de tournoi sur la blockchain : Avalanche + Solidity sur une chaîne de test, contrats pour enregistrer/gérer/récupérer les scores |
| Minor | Backend ICP qui tourne sur une blockchain (**incompatible avec le SSR**)                                                                |

### Modules au choix

| Type  | Module                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Major | Module sur mesure, conséquent et techniquement complexe, justifié dans le README (pourquoi ce choix, quelles difficultés, quelle valeur, pourquoi 2 points). Fonctionnalités triviales = refus |
| Minor | Pareil, en plus petit, demande quand même une justification                                                                                                                                    |

## Exemple de projet à 14 points (Pong, tiré du sujet)

- Jeu : jeu web (2) + joueurs à distance (2) + tournoi (1) + personnalisation (1) = **6**
- Gestion des utilisateurs : standard (2) + OAuth (1) = **3**
- Web : frameworks front+back (2) + ORM (1) = **3**
- IA : adversaire IA (2) = **2**
- **Total : 14**

Le sujet liste aussi environ 25 autres idées de projet : jeu, social/collaboratif,
créatif/médias, productivité, et niches spécialisées : voir le chapitre V du PDF.

## Exigences pour le README

À la racine du repo, **en anglais**. Il doit contenir :

- Première ligne, en italique : _This project has been created as part of the 42 curriculum by \<login1\>[, \<login2\>, …]_
- **Description** : nom du projet, but, vue d'ensemble, fonctionnalités principales.
- **Instructions** : prérequis (logiciels, outils, versions, configuration du `.env`) et étapes pour lancer le projet.
- **Resources** : références utilisées **et comment l'IA a été utilisée**, pour quelles tâches et quelles parties du projet.

Sections supplémentaires demandées pour ce projet :

- **Team Information** : le ou les rôles et les responsabilités de chaque membre.
- **Project Management** : comment le travail a été organisé, outils utilisés, canaux de communication.
- **Technical Stack** : frontend, backend, base de données (et pourquoi), autres bibliothèques, justification des choix importants.
- **Database Schema** : structure, tables/collections et relations, champs et types importants.
- **Features List** : chaque fonctionnalité réalisée, qui y a travaillé, ce qu'elle fait.
- **Modules** : tous les modules choisis, calcul des points, justification de chacun (surtout les modules sur mesure), comment ils ont été faits, par qui.
- **Individual Contributions** : détail par membre, difficultés rencontrées et comment elles ont été résolues.

Un README pauvre ou incomplet pénalise l'évaluation.

## Bonus

Pris en compte seulement quand des modules valant les 14 points obligatoires sont tous faits. Chaque
module en plus doit marcher complètement, correspondre à sa description, apporter une vraie valeur, et être
justifié dans le README.
Major = 2, Minor = 1, **plafonné à 5 points de bonus**.

## Rendu et évaluation

- Seul ce qui est dans le repository Git est évalué : vérifie bien les noms de fichiers.
- Chaque module annoncé doit être **montré en direct** ; s'il ne marche pas ou est incomplet = 0 point.
- On demandera à l'équipe comment les rôles ont été répartis, comment le travail a été organisé et
  communiqué, et ce que chaque membre a apporté.
- Une **petite modification en direct** du projet peut être demandée pour vérifier la vraie compréhension
  (changer un comportement, quelques lignes de code, une fonctionnalité simple) : faisable en quelques minutes.

## Règles d'usage de l'IA (chapitre I)

- Utilise l'IA pour réduire le travail répétitif et pour apprendre à bien écrire des prompts, pas pour sous-traiter la compréhension.
- N'utilise que du contenu généré par l'IA que tu comprends entièrement et dont tu peux répondre.
- Vérifie, relis, remets en question et teste systématiquement tout ce qui est généré.
- Demande toujours une relecture par un pair : ne pas savoir expliquer ton propre code fait échouer l'évaluation.
