# Documentation du projet

Ceci est la version française de la documentation. La version anglaise est ici : [README.md](../docs/README.md).

Où se trouve chaque sujet, pour que chaque fait ait une seule place. Le [README](../README.md) à la
racine du dépôt est le point d'entrée pour l'évaluation ; ce dossier contient le détail qui se cache derrière.

GitHub Pages sert le dossier anglais `docs/` depuis `main` à l'adresse <https://victorbro.github.io/ft_transcendence/>,
donc tu peux lire là-bas les pages HTML de `docs/` sans cloner le dépôt. Ce dossier-ci n'est pas en ligne :
ouvre son [index.html](index.html) depuis ton clone.

## Les dossiers

| Dossier                                                         | La question à laquelle il répond                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [api/](api/README.md)                                           | Comment marche chaque fichier de `apps/api`, expliqué depuis zéro, chapitre par chapitre ?     |
| [web/](web/README.md)                                           | Comment marche chaque fichier de `apps/web`, des bases de React jusqu'à chaque page ?          |
| [modules/](modules/README.md)                                   | Quels modules on revendique, combien de points, et comment chacun répond au sujet ?            |
| [architecture/](architecture/overview.md)                       | Comment l'app est construite, et pourquoi ?                                                    |
| [operations/](operations/deployment.md)                         | Comment on la lance, la déploie, la surveille et la met à jour ?                               |
| [content/](content/lessons.md)                                  | Que sont les leçons et les questions de placement, et comment sont-elles écrites et chargées ? |
| [subject/](subject/summary.md)                                  | Que demande le sujet de 42 ?                                                                   |
| [transcendence-course/](../docs/transcendence-course/README.md) | Qu'a construit chaque membre de l'équipe, expliqué avec ses propres mots pour la soutenance ?  |
| [site/](../docs/site/milestone1-data-model.html)                | Les pages et le script derrière le site GitHub Pages                                           |

## Tous les documents

### À la racine

| Document                                       | Ce qu'il couvre                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html)                       | La version française de la page d'accueil du site GitHub Pages : le produit sur une page, les milestones et leurs issues avec leur état en direct depuis GitHub |
| [backlog.md](backlog.md)                       | Le travail qu'on sait devoir faire, pas encore planifié                                                                                                         |
| [code-ownership.md](../docs/code-ownership.md) | Qui a touché quel fichier, et dans quelles pull requests, en français : le point de départ de chaque dossier de transcendence-course/                           |

### api/

| Document                                                                                                                                                                                                                                                                                                                           | Ce qu'il couvre                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [api/README.md](api/README.md)                                                                                                                                                                                                                                                                                                     | L'ordre de lecture et ce que chaque chapitre apprend                    |
| [01](api/01-big-picture.md), [02](api/02-boot-and-request-flow.md), [03](api/03-infrastructure.md), [04](api/04-database.md), [05](api/05-auth-and-users.md), [06](api/06-llm.md), [07](api/07-courses-placement.md), [08](api/08-lessons.md), [09](api/09-social-and-realtime.md), [10](api/10-tests.md), [11](api/11-scripts.md) | Les onze chapitres, de ce qu'est une API jusqu'aux tests et aux scripts |

### web/

| Document                                                                                                                                                                                                                                                                                | Ce qu'il couvre                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [web/README.md](web/README.md)                                                                                                                                                                                                                                                          | L'ordre de lecture et ce que chaque chapitre apprend                             |
| [01](web/01-react-and-nextjs.md), [02](web/02-routing-layouts-i18n.md), [03](web/03-shell-components.md), [04](web/04-talking-to-the-api.md), [05](web/05-account-pages.md), [06](web/06-learning-pages.md), [07](web/07-lesson-player.md), [08](web/08-chat.md), [09](web/09-tests.md) | Les neuf chapitres, des bases de React jusqu'à chaque page, le chat et les tests |

### modules/

| Document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ce qu'il couvre                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [modules/README.md](modules/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Chaque module revendiqué avec son type et ses points, le total, et les modules qu'on ne revendique pas avec la raison                                             |
| [modules/\_template.md](modules/_template.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Les titres que suit chaque fichier de module                                                                                                                      |
| [framework.md](modules/framework.md), [orm.md](modules/orm.md), [user-management.md](modules/user-management.md), [two-factor-auth.md](modules/two-factor-auth.md), [user-interaction.md](modules/user-interaction.md), [websockets.md](modules/websockets.md), [llm-interface.md](modules/llm-interface.md), [i18n.md](modules/i18n.md), [browsers.md](modules/browsers.md), [ssr.md](modules/ssr.md), [advanced-search.md](modules/advanced-search.md), [gamification.md](modules/gamification.md), [monitoring.md](modules/monitoring.md), [custom-ci-cd.md](modules/custom-ci-cd.md), [custom-cloud-deploy.md](modules/custom-cloud-deploy.md) | Un fichier par module revendiqué : ce que demande le sujet, ce qu'on a construit, où est le code, comment le montrer, les tests, les limites et qui l'a construit |

### architecture/

| Document                                                         | Ce qu'il couvre                                                                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)             | Les containers en production et en développement, les routes de Caddy, une requête à travers la stack, une mise à jour en direct, les routes des leçons, l'image d'outillage et ce que lance la CI |
| [architecture/product.md](architecture/product.md)               | Le parcours de l'apprenant (onboarding, placement, l'objectif du jour, la leçon, les résultats), Redis, la couche IA et la limitation du débit                                                     |
| [architecture/data-model.md](architecture/data-model.md)         | Chaque table et chaque enum, ce que garde Redis, les tables dont chaque module a besoin, et ce qui a été retiré de l'ancien plan                                                                   |
| [architecture/realtime.md](architecture/realtime.md)             | Quelles fonctionnalités utilisent REST, la gateway WebSocket ou les Server-Sent Events, et pourquoi ; chaque événement du socket ; le flux de la discussion de leçon                               |
| [architecture/technical-plan.md](architecture/technical-plan.md) | La stack et pourquoi, l'organisation du dépôt, les étapes Docker, le Makefile, les workflows de CI, l'ordre de construction et les risques                                                         |

### operations/

| Document                                               | Ce qu'il couvre                                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [operations/deployment.md](operations/deployment.md)   | Le serveur Oracle Cloud, le DNS, le `.env`, déployer et redéployer, les deploys automatiques, la mémoire, le monitoring sur le serveur, et le lancement derrière un autre reverse proxy |
| [operations/monitoring.md](operations/monitoring.md)   | Prometheus, Grafana, les dashboards, les alertes et chaque métrique                                                                                                                     |
| [operations/versions.md](operations/versions.md)       | Ce qui doit bouger ensemble, ce qui est retenu, et quand regarder à nouveau                                                                                                             |
| [operations/development.md](operations/development.md) | Les raccourcis du shell du devcontainer, et la stack de monitoring en développement                                                                                                     |

### content/

| Document                                     | Ce qu'il couvre                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [content/lessons.md](content/lessons.md)     | Les leçons : plans, écriture, vérifications, seed, les pages de leçon, le score et l'étape de discussion                              |
| [content/item-bank.md](content/item-bank.md) | La banque de questions de placement : quoi écrire, sous quelle forme, pour que les questions puissent être seedées et jamais répétées |

### subject/

| Document                                                             | Ce qu'il couvre                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [subject/summary.md](subject/summary.md)                             | Un résumé du sujet : la partie obligatoire, les modules, les règles du README et l'évaluation |
| [subject/ft_transcendence.pdf](../docs/subject/ft_transcendence.pdf) | Le sujet lui-même, qui reste la référence                                                     |

### transcendence-course/

| Document                                                                 | Ce qu'il couvre                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [transcendence-course/README.md](../docs/transcendence-course/README.md) | Comment marche le dossier, et un dossier par membre : [victor/](../docs/transcendence-course/victor/README.md), [endrit/](../docs/transcendence-course/endrit/README.md), [anais/](../docs/transcendence-course/anais/README.md), [luca/](../docs/transcendence-course/luca/README.md), [bastian/](../docs/transcendence-course/bastian/README.md) |

### site/

| Document                                                                   | Ce qu'il couvre                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [site/milestone1-data-model.html](../docs/site/milestone1-data-model.html) | Onboarding et placement : chaque format, la spec comparée au code                                    |
| [site/milestone2-data-model.html](../docs/site/milestone2-data-model.html) | Leçons : les fichiers de leçon, le seed, les API des tentatives et de la discussion, la gamification |
| [site/milestone3-data-model.html](../docs/site/milestone3-data-model.html) | Temps réel et social : événements du socket, amitiés, messages, présence                             |
| [site/gh-status.js](../docs/site/gh-status.js)                             | Pas un document : les pages HTML le chargent pour afficher l'état des issues en direct depuis GitHub |

Chaque nombre, route, variable et nom de métrique dans ces documents vient du code sur `main`.
Quand le code change, le document qui possède le sujet change dans la même pull request.

La version anglaise `docs/` est la référence. Ce dossier en est la traduction : quand les deux ne disent
pas la même chose, c'est `docs/` qui a raison. Une pull request qui change une page de `docs/` met à jour
sa jumelle dans `docs-fr/` dans la même pull request, ou ouvre une issue pour ça.
