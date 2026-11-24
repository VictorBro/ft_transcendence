# Modules

Un module est une fonctionnalité de la liste des modules du sujet (chapitre IV). Chacun rapporte des points :
un module **Major** vaut 2 points et un module **Minor** vaut 1 point. Le projet demande **14 points**.
Les points au-dessus de 14 sont un bonus, et ce bonus est **plafonné à 5**, donc au plus **19 points comptent**
([../subject/summary.md](../subject/summary.md), « Modules: 14 points required » et « Bonus »). Un
module qui ne marche pas le jour de l'évaluation compte 0, donc on en annonce plus que 19 pour garder une
marge.

Chaque module annoncé a son propre fichier dans ce dossier. Chaque fichier a les mêmes titres, tirés de
[\_template.md](_template.md) : ce que demande le sujet, comment on y répond, comment ça marche, où est le code,
comment le montrer à la soutenance, les tests, les limites, et qui l'a construit.

## Modules annoncés

| Module                                                                        | Type           | Points | Ce qu'on a construit                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Framework pour le frontend et le backend](framework.md)                      | Major          | 2      | L'app web est construite avec Next.js (basé sur React), l'API avec NestJS                                                                                                                             |
| [ORM pour la base de données](orm.md)                                         | Minor          | 1      | L'API lit et écrit dans PostgreSQL avec Prisma 7, avec des requêtes typées au lieu de SQL écrit à la main                                                                                             |
| [Gestion standard des utilisateurs](user-management.md)                       | Major          | 2      | Un profil à modifier, un avatar à envoyer ou à retirer (avec un avatar par défaut), des amis avec leur statut en ligne en direct, et une page de profil pour chaque utilisateur                       |
| [2FA complète](two-factor-auth.md)                                            | Minor          | 1      | Un code à six chiffres d'une app d'authentification à chaque connexion, dix codes de secours à usage unique, et un moyen de la désactiver                                                             |
| [Interaction entre utilisateurs : chat, profils et amis](user-interaction.md) | Major          | 2      | Des demandes d'ami, des pages de profil, et des messages privés entre amis qui arrivent en direct, sont stockés, et affichent un nombre de non-lus                                                    |
| [Fonctionnalités en temps réel avec WebSockets](websockets.md)                | Major          | 2      | Une connexion socket.io par onglet sur `/ws` envoie les nouveaux messages, les demandes d'ami, le statut en ligne et les changements de cours sans recharger la page                                  |
| [Interface LLM complète](llm-interface.md)                                    | Major          | 2      | Un tuteur de leçon dont la réponse arrive mot par mot, et de nouvelles questions de placement écrites en arrière-plan, avec des erreurs claires et des limites de requêtes                            |
| [Internationalisation : 3 langues](i18n.md)                                   | Minor          | 1      | Tout le site en anglais, français et allemand, avec un menu de langue et la langue dans l'adresse (`/en/...`, `/fr/...`, `/de/...`)                                                                   |
| [Support de 2 navigateurs en plus](browsers.md)                               | Minor          | 1      | Chaque test navigateur tourne sur Chromium, Firefox et WebKit (le moteur derrière Safari), à chaque pull request                                                                                      |
| [Server-Side Rendering](ssr.md)                                               | Minor          | 1      | Le serveur envoie des pages complètes avec leur contenu, donc elles l'affichent même avec JavaScript désactivé                                                                                        |
| [Recherche avancée](advanced-search.md)                                       | Minor          | 1      | La page de toutes les leçons : recherche par mots, filtres, tri, groupes et pages, chaque vue est une adresse qu'on peut partager                                                                     |
| [Gamification](gamification.md)                                               | Minor          | 1      | Des XP et des rangs, un défi du jour et 16 succès, stockés par cours                                                                                                                                  |
| [Monitoring avec Prometheus et Grafana](monitoring.md)                        | Major          | 2      | Prometheus collecte les métriques de l'app, des bases de données et du serveur ; Grafana affiche quatre tableaux de bord derrière une connexion ; des règles d'alerte peuvent envoyer sur Discord     |
| [CI/CD](custom-ci-cd.md)                                                      | Major (custom) | 2      | Des vérifications à chaque pull request, un bouton de merge bloqué jusqu'à ce qu'elles passent et qu'un coéquipier approuve, des images multi-architecture, et un serveur qui se met à jour tout seul |
| [Déploiement cloud avec DNS et Let's Encrypt](custom-cloud-deploy.md)         | Minor (custom) | 1      | L'app tourne sur un serveur Oracle Cloud à <https://transcendence.dpdns.org>, avec un certificat Let's Encrypt que tous les navigateurs acceptent                                                     |

**Total : 22 points** : 7 modules Major (14 points) et 8 modules Minor (8 points). Au plus 19
comptent : les 14 demandés et le bonus de 5 points. Les 3 autres points sont la marge au cas où un module
ne serait pas accepté le jour J.

Les deux modules custom ne sont pas dans la liste du sujet. Le sujet demande que le README les justifie
(pourquoi on les a choisis, les défis techniques, ce qu'ils apportent, et pourquoi ils méritent leur taille).
Cette justification est dans le [README racine](../../../README.md#modules), résumée à partir des dernières
sections de [custom-ci-cd.md](custom-ci-cd.md) et
[custom-cloud-deploy.md](custom-cloud-deploy.md).

### La gamification en dehors d'un jeu

La gamification est dans le chapitre jeu du sujet (IV.6), et notre produit est une app pour apprendre des langues,
pas un jeu. Mais le sujet la propose justement pour notre type d'app : au chapitre V.6, la « Language
Learning Platform » a « Suggested modules: User interaction, Gamification, Multiple languages,
Voice integration, Analytics dashboard ». Elle est aussi proposée pour le Fitness Tracker (V.5) et la
Forum Platform (V.3), et aucun des deux n'est un jeu. Ses voisins dans IV.6 (Tournament, Game
customization, Spectator mode) disent chacun qu'ils demandent un jeu. La gamification, non, et la
règle de dépendance du sujet ne la cite pas : « Gaming modules (AI Opponent, Tournament, Game
customization, Spectator mode, Multiplayer 3+, Add another game) require that at least one game be
implemented first. » Donc on l'annonce, et les actions récompensées sont finir des leçons et atteindre
l'objectif du jour. C'est notre lecture du sujet : **à confirmer avec le staff avant la soutenance**. L'argument
complet est dans [gamification.md](gamification.md).

## Non annoncés

Ces modules sont dans la liste du sujet, et on ne les annonce pas. Chaque raison a été vérifiée dans le
code.

| Module                               | Type  | Pourquoi on ne l'annonce pas                                                                                                                                                                                                                                      |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete RAG system                  | Major | Abandonné. pgvector est encore dans l'image de la base de données ([compose.yml](../../../compose.yml)), mais aucune table ne contient de documents ou d'embeddings ([data-model.md](../architecture/data-model.md) §9)                                           |
| Custom design system                 | Minor | Le sujet demande au moins 10 composants réutilisables. [packages/ui](../../../packages/ui/src/components) en a trois : `Button`, `Card` et `ProgressBar`                                                                                                          |
| Notification system                  | Minor | Le sujet demande des notifications pour chaque action de création, modification et suppression. On envoie seulement les messages, les événements d'amis, le statut en ligne et les changements de cours ([websockets.md](websockets.md))                          |
| Progressive Web App                  | Minor | Pas de manifest d'app web et pas de service worker : [apps/web/public](../../../apps/web/public) contient seulement `logo.webp` et `robots.txt`                                                                                                                   |
| Remote authentication with OAuth 2.0 | Minor | La connexion se fait seulement par email et mot de passe, avec la 2FA ; il n'y a pas de code OAuth dans l'API                                                                                                                                                     |
| Public API                           | Major | L'API a une doc Swagger sur `/api/docs` ([app.setup.ts](../../../apps/api/src/app.setup.ts)) et des limites de requêtes, mais pas de clés d'API : un client se connecte avec le cookie de session                                                                 |
| File upload and management           | Minor | L'envoi d'avatar existe, dans la [gestion des utilisateurs](user-management.md) : PNG, JPEG ou WebP, 2 Mio au plus, vérifié des deux côtés. Le module demande plus : plusieurs types de fichiers, un aperçu, une progression, et la gestion de plusieurs fichiers |
| Full WCAG 2.1 AA compliance          | Major | Aucun audit d'accessibilité ni aucun test automatique d'accessibilité n'a été fait                                                                                                                                                                                |
| RTL support                          | Minor | Les trois langues (anglais, français, allemand) s'écrivent toutes de gauche à droite ([i18n.md](i18n.md))                                                                                                                                                         |
| User activity analytics dashboard    | Minor | Aucun tableau de bord de l'activité des utilisateurs n'est construit ; les tables `DailyStat` et `Mistake` de l'ancien plan ont été abandonnées ([data-model.md](../architecture/data-model.md) §9)                                                               |

On n'annonce pas non plus les autres modules de jeu (ils demandent tous un jeu), Advanced chat, WAF et
Vault, ELK, les microservices, ni la blockchain.
