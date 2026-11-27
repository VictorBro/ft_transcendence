# Déroulé de la soutenance

L'ordre de la soutenance, sur une seule page. Les étapes de chaque démo sont dans la section « Comment le montrer à la soutenance » du fichier du module, dans [modules/](modules/README.md) : cette page renvoie vers elles et ne les répète pas. Quand une étape est fausse ou périmée, corrige-la dans le fichier du module, pas ici.

## L'ordre

Garde les outils de développement du navigateur ouverts sur l'onglet Console pendant toute la soutenance : le sujet n'accepte aucune erreur ni aucun avertissement.

| # | Quoi | Compte | Qui le montre | Durée |
| --- | --- | --- | --- | --- |
| 1 | [Les vérifications obligatoires](#les-vérifications-obligatoires) | aucun | Victor | 5 min |
| 2 | [Framework](modules/framework.md#comment-le-montrer-à-la-soutenance) | un nouveau compte | Victor | 5 min |
| 3 | [ORM](modules/orm.md#comment-le-montrer-à-la-soutenance) | un nouveau compte, puis `make studio` | Victor, Anaïs | 5 min |
| 4 | [Rendu côté serveur](modules/ssr.md#comment-le-montrer-à-la-soutenance) | un nouveau compte | Bastian | 5 min |
| 5 | [Interface LLM](modules/llm-interface.md#comment-le-montrer-à-la-soutenance), étapes 1 à 13 | un nouveau compte | Luca, Endrit | 5 min |
| 6 | [Recherche avancée](modules/advanced-search.md#comment-le-montrer-à-la-soutenance), dans une fenêtre privée | un nouveau compte | Luca, Endrit | 5 min |
| 7 | [Interface LLM](modules/llm-interface.md#comment-le-montrer-à-la-soutenance), de l'étape 14 à la fin | le compte de la ligne 5 | Luca, Endrit | 5 min |
| 8 | [Internationalisation](modules/i18n.md#comment-le-montrer-à-la-soutenance) | un nouveau compte | Luca | 5 min |
| 9 | [Gamification](modules/gamification.md#comment-le-montrer-à-la-soutenance) | un nouveau compte, puis un apprenant de démo | Anaïs | 5 min |
| 10 | [2FA](modules/two-factor-auth.md#comment-le-montrer-à-la-soutenance) | un nouveau compte | Victor | 5 min |
| 11 | [Gestion des utilisateurs](modules/user-management.md#comment-le-montrer-à-la-soutenance) | deux comptes, deux fenêtres | Victor, Anaïs, Endrit | 5 min |
| 12 | [Interaction entre utilisateurs](modules/user-interaction.md#comment-le-montrer-à-la-soutenance) | deux comptes, deux fenêtres | Victor | 5 min |
| 13 | [WebSockets](modules/websockets.md#comment-le-montrer-à-la-soutenance) | deux comptes, deux fenêtres | Victor, Endrit | 5 min |
| 14 | [Deux navigateurs de plus](modules/browsers.md#comment-le-montrer-à-la-soutenance) | Firefox, et Safari s'il y a un Mac | Bastian | 5 min |
| 15 | [Monitoring](modules/monitoring.md#comment-le-montrer-à-la-soutenance) | `admin` de Grafana | Victor | 5 min |
| 16 | [CI/CD](modules/custom-ci-cd.md#comment-le-montrer-à-la-soutenance) | GitHub, une pull request de démo | Victor | 10 min |
| 17 | [Déploiement cloud](modules/custom-cloud-deploy.md#comment-le-montrer-à-la-soutenance) | le site en ligne, puis `ssh` | Victor | 5 min |

Les durées sont des estimations tant que la répétition ne les a pas mesurées. La ligne 6 occupe la minute d'attente de la limite du LLM. Les lignes 11 à 13 créent chacune leurs deux utilisateurs : la répétition dira si une seule paire suffit pour les trois. La personne qui montre un module est celle qui en a construit la plus grande partie, d'après la section « Qui l'a construit » de son fichier ; les évaluateurs peuvent quand même demander à n'importe qui d'expliquer ou de modifier n'importe quelle partie.

## Les vérifications obligatoires

S'il en manque une, le projet est refusé ([subject/summary.md](subject/summary.md)).

- [ ] **Une seule commande.** `make` depuis un clone neuf construit et lance tout ([README](../README.md)).
- [ ] **HTTPS.** L'app répond sur `https://localhost` (ou le port que `make` affiche), et le site en ligne a un certificat que le navigateur accepte ([custom-cloud-deploy.md](modules/custom-cloud-deploy.md#comment-le-montrer-à-la-soutenance)).
- [ ] **Une console propre.** Aucune erreur ni aucun avertissement dans l'onglet Console pendant toute la démo.
- [ ] **`.env.example`.** Il est commité, et `git check-ignore .env` montre que `.env` est ignoré.
- [ ] **Les pages sans JavaScript.** Coupe JavaScript : les pages affichent toujours leur contenu ([ssr.md](modules/ssr.md#comment-le-montrer-à-la-soutenance)).
- [ ] **Politique de confidentialité et CGU.** Les liens du pied de page ouvrent `/en/privacy` et `/en/terms`, avec un vrai contenu, dans les trois langues.

## Avant le jour J

- [ ] Faire confirmer par le staff que la gamification compte dans une app d'apprentissage ([modules/README.md](modules/README.md#la-gamification-en-dehors-dun-jeu)).
- [ ] Sur la machine de la soutenance : un clone neuf, `make` au vert, le certificat local accepté, `HTTPS_PORT` réglé si le port 443 n'est pas libre.
- [ ] Dans `.env` : `DEMO_PASSWORD` rempli avant `make`, pour les apprenants de démo ; `LLM_PROVIDER=gemini` et une `LLM_API_KEY` qui marche, avec assez de quota pour la journée.
- [ ] Le site en ligne marche et son certificat est valide ; la personne de la ligne 17 peut se connecter au serveur en `ssh`.
- [ ] La personne de la ligne 16 peut pousser une branche et ouvrir une pull request ; supprimer la branche de démo après.
- [ ] Chaque membre a relu son propre dossier dans [transcendence-course/](../docs/transcendence-course/README.md).

## Répétitions

Une répétition déroule cette page du début à la fin, menée par quelqu'un qui n'a pas construit le module montré.

| Date | Menée par | Durée totale | Ce qu'elle a trouvé |
| --- | --- | --- | --- |
| | | | |
