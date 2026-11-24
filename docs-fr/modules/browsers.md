# Support d'au moins 2 navigateurs en plus (Minor, 1 point)

**Type :** Minor. **Points :** 1. **Statut :** fait.

Le sujet demande que l'app marche dans Google Chrome. Ce module dit qu'elle marche aussi dans deux autres
navigateurs. On la teste sur Firefox et sur WebKit, le moteur derrière Safari : chaque test automatique
dans un navigateur tourne sur Chromium, Firefox et WebKit, à chaque pull request.

## Ce que demande le sujet

Le module est une ligne Minor du tableau Accessibilité et internationalisation de
[../subject/summary.md](../subject/summary.md) :

> ≥2 navigateurs supplémentaires entièrement supportés, testés, documentés

Le PDF ([../../docs/subject/ft_transcendence.pdf](../../docs/subject/ft_transcendence.pdf), chapitre IV,
Accessibility and Internationalization) le formule comme ceci :

> Minor: Support for additional browsers.
>
> - Full compatibility with at least 2 additional browsers (Firefox, Safari, Edge, etc.).
> - Test and fix all features in each browser.
> - Document any browser-specific limitations.
> - Consistent UI/UX across all supported browsers.

« Additional » veut dire en plus du navigateur que la partie obligatoire demande déjà. Le même fichier
liste, sous « Partie obligatoire » :

> - Compatible avec la dernière version stable de **Google Chrome**.
> - **Aucune erreur ni warning JS** dans la console du navigateur.

Donc les deux navigateurs en plus ne doivent pas non plus afficher d'erreurs ou d'avertissements dans la console.

## Comment on y répond

| Le sujet demande                                  | Ce qu'on a construit                                                                                                                                                                                                                                                                                                                                                            | Où                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Au moins 2 navigateurs en plus                    | Firefox et WebKit (le moteur de Safari), à côté de Chromium. Playwright (l'outil qui pilote un vrai navigateur dans nos tests) a un « project » par moteur : `chromium` (Desktop Chrome), `firefox` (Desktop Firefox) et `webkit` (Desktop Safari).                                                                                                                             | [e2e/playwright.config.ts](../../e2e/playwright.config.ts)                                                                       |
| Entièrement supportés                             | L'app a des corrections pour des choses que seul un moteur fait (voir « Comment ça marche »). Le contrôle de la console (un test qui échoue à la moindre erreur ou au moindre avertissement dans la console) tourne sur les trois moteurs. Navigateurs de bureau seulement, voir [Limites et choix](#limites-et-choix).                                                         | [e2e/support/console-guard.ts](../../e2e/support/console-guard.ts), [e2e/tests/console.spec.ts](../../e2e/tests/console.spec.ts) |
| Testés                                            | Chaque fichier de spec tourne sur les trois moteurs dans la CI : 3 moteurs × 2 parties = 6 jobs, chacun sur sa propre stack de production. Un dernier job, « playwright (production stack) », échoue si un des six n'a pas réussi. Quelques tests tournent seulement sur Chromium, chacun avec un `test.skip` qui donne la raison (voir [Limites et choix](#limites-et-choix)). | [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml)                                                                     |
| Documentés, avec les limites de chaque navigateur | Le README a une section « Browser support » : quels moteurs, comment la CI les lance, les tests qui tournent seulement sur Chromium (avec un lien vers la liste dans [Limites et choix](#limites-et-choix)), comment lancer un seul moteur, et les limites connues (pas de voix de lecture, navigateurs mobiles pas testés).                                                    | [README.md](../../README.md#browser-support)                                                                                     |
| UI/UX cohérente entre les navigateurs             | Les trois moteurs reçoivent les mêmes pages, les mêmes styles et les mêmes tests, avec les mêmes vérifications de ce qui est à l'écran. La vérification de la mise en page en largeur de téléphone tourne aussi sur chaque moteur.                                                                                                                                              | [e2e/tests/layout.spec.ts](../../e2e/tests/layout.spec.ts), [e2e/tests/layout-gate.spec.ts](../../e2e/tests/layout-gate.spec.ts) |

## Comment ça marche

**Une suite, trois moteurs.** [e2e/playwright.config.ts](../../e2e/playwright.config.ts) liste
trois projects. Son commentaire donne la règle : « every spec runs on all three engines. A spec that
cannot hold on one of them says so with a test.skip naming the engine and the reason, never by
dropping the project. » (chaque spec tourne sur les trois moteurs ; une spec qui ne tient pas sur l'un
d'eux le dit avec un test.skip, jamais en retirant le project.)

**Dans la CI.** [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml) tourne à chaque pull request
et à chaque push sur `main`. Sa matrice est `browser: [chromium, firefox, webkit]` × `part:
[lesson, rest]`. `lesson.spec.ts` prend environ la moitié du temps de la suite, donc c'est une partie, et toutes
les autres specs sont l'autre partie (`E2E_PART` dans la config). Chaque job :

1. démarre la stack de production (`compose.yml` + `compose.prod.yml`) ;
2. applique les migrations et charge la banque de questions (`make db-ready`) ;
3. lance `./scripts/playwright-in-image.sh test --project=<browser>`.

Un seul job, `playwright (chromium, rest)`, vérifie ensuite la stack de monitoring et lance le test de
redémarrage de l'API tout seul, après la suite (`E2E_RESTART=1`).

[scripts/playwright-in-image.sh](../../scripts/playwright-in-image.sh) lance Playwright dans
l'image Playwright de Microsoft (`mcr.microsoft.com/playwright:v<version>-noble`, la version vient de
[e2e/package.json](../../e2e/package.json)). Cette image contient déjà les trois navigateurs et leurs
paquets système. `fail-fast: false` laisse les autres jobs tourner quand un échoue, pour que « a WebKit
failure should not hide whether Chromium and Firefox pass » (un échec sur WebKit ne cache pas si Chromium et Firefox passent).

**Sur la machine d'un développeur.** Dans le [Makefile](../../Makefile), `BROWSERS ?= chromium` : `make` et
`make playwright` lancent seulement Chromium, pour rester rapides. `make playwright-all` lance les trois moteurs, « as
CI runs it » (comme la CI). L'image du devcontainer a les bibliothèques système des trois navigateurs
([.devcontainer/Dockerfile](../../.devcontainer/Dockerfile)).

**Le contrôle de la console sur trois moteurs.** Chaque moteur décrit les choses avec ses propres mots.
[e2e/support/console-guard.ts](../../e2e/support/console-guard.ts) gère ça :

- Une navigation annule les prefetches encore ouverts. Chaque moteur le signale comme une requête échouée :
  Chromium `net::ERR_ABORTED`, Firefox `NS_BINDING_ABORTED`, WebKit `cancelled` ou
  `Load request cancelled`. Le contrôle ignore seulement ces quatre messages.
- Trois avertissements de Firefox sont autorisés, et seulement sur les pages `/grafana/` : ils viennent du code
  de Grafana, pas du nôtre. Le même avertissement sur une de nos pages fait toujours échouer le test.
- `settle()` attend que la page devienne calme. Firefox ne signale parfois jamais `networkidle`, donc il
  compte aussi lui-même les requêtes ouvertes et prend ce qui arrive en premier.

**Des corrections dans l'app pour un seul moteur.** Chacune a un commentaire dans le code :

| Moteur  | Ce qui ne va pas                                                                                                                                                       | La correction                                                                                                                      | Où                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Firefox | Firefox ne commence jamais un glisser-déposer depuis un `<button>`.                                                                                                    | Les options du plateau à glisser sont un `div` avec le rôle bouton, qu'on peut toujours utiliser au clavier avec Entrée et Espace. | [apps/web/components/lesson/board.tsx](../../apps/web/components/lesson/board.tsx)                                     |
| Firefox | Firefox affiche une connexion interrompue quand une page se ferme avec un socket ouvert.                                                                               | `closeOnBeforeunload: true` ferme le socket d'abord.                                                                               | [apps/web/components/tab-socket.ts](../../apps/web/components/tab-socket.ts)                                           |
| Safari  | Safari termine une composition de frappe (par exemple des accents tapés avec une touche morte) avant le keydown, donc Entrée pouvait envoyer un message à moitié tapé. | Entrée ne fait rien quand `keyCode` vaut 229.                                                                                      | [apps/web/app/[locale]/(messages)/chat/chat-thread.tsx](<../../apps/web/app/[locale]/(messages)/chat/chat-thread.tsx>) |
| WebKit  | WebKit ne donne pas le focus tout seul à une zone qui défile, donc le clavier ne pouvait pas atteindre la fin d'un long texte.                                         | Le document de lecture est une zone qui peut recevoir le focus.                                                                    | [apps/web/components/lesson/kinds/reading.tsx](../../apps/web/components/lesson/kinds/reading.tsx)                     |

**Lire à voix haute sans voix.** Les boutons Listen utilisent la synthèse vocale du navigateur
([apps/web/components/lesson/speech.tsx](../../apps/web/components/lesson/speech.tsx)). Les voix
changent selon les navigateurs et les systèmes, et les navigateurs headless (sans fenêtre) n'en ont souvent aucune. Quand il n'y a pas de voix
pour la langue du cours, les boutons Listen ne sont pas affichés, et la leçon marche quand même. Dans une
leçon de functions, la réponse d'écoute a toujours un bouton **Show the text**, donc on peut y répondre
sans le son ([apps/web/components/lesson/kinds/functions.tsx](../../apps/web/components/lesson/kinds/functions.tsx)).

## Où est le code

| Chemin                                                                                                                                                                                                                                                                                                                | Ce qu'il fait                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [e2e/playwright.config.ts](../../e2e/playwright.config.ts)                                                                                                                                                                                                                                                            | Les trois projects `chromium`, `firefox`, `webkit` ; la séparation `lesson`/`rest` ; 2 workers (1 pour le run de redémarrage), pas de nouvel essai.      |
| [.github/workflows/e2e.yml](../../.github/workflows/e2e.yml)                                                                                                                                                                                                                                                          | Les 6 jobs (3 moteurs × 2 parties) et le job de contrôle « playwright (production stack) ».                                                              |
| [scripts/playwright-in-image.sh](../../scripts/playwright-in-image.sh)                                                                                                                                                                                                                                                | Lance Playwright dans son image officielle, qui contient les trois navigateurs.                                                                          |
| [Makefile](../../Makefile)                                                                                                                                                                                                                                                                                            | `BROWSERS`, `make playwright`, `make playwright-all`, `make report`.                                                                                     |
| [e2e/package.json](../../e2e/package.json)                                                                                                                                                                                                                                                                            | `test:e2e`, `test:e2e:restart` et `browsers` (installe Chromium, Firefox et WebKit).                                                                     |
| [e2e/support/console-guard.ts](../../e2e/support/console-guard.ts)                                                                                                                                                                                                                                                    | Le contrôle de la console : les mots de chaque moteur pour une requête annulée, les exceptions Firefox seulement pour Grafana, `settle()`.               |
| [e2e/support/signup-budget.ts](../../e2e/support/signup-budget.ts)                                                                                                                                                                                                                                                    | Trois moteurs créent trois fois plus de comptes. Ce fichier espace les inscriptions et les connexions pour rester sous les limites de requêtes de l'API. |
| [apps/web/components/lesson/speech.tsx](../../apps/web/components/lesson/speech.tsx)                                                                                                                                                                                                                                  | Les boutons Listen, seulement quand le navigateur a une voix pour la langue.                                                                             |
| [apps/web/components/lesson/board.tsx](../../apps/web/components/lesson/board.tsx), [apps/web/components/tab-socket.ts](../../apps/web/components/tab-socket.ts), [chat-thread.tsx](<../../apps/web/app/[locale]/(messages)/chat/chat-thread.tsx>), [reading.tsx](../../apps/web/components/lesson/kinds/reading.tsx) | Les corrections pour un seul moteur, du tableau plus haut.                                                                                               |
| [README.md](../../README.md#browser-support)                                                                                                                                                                                                                                                                          | La section « Browser support ».                                                                                                                          |

## Comment le montrer à la soutenance

1. **La documentation.** Ouvre [README.md](../../README.md#browser-support), section « Browser
   support ». Puis ouvre [e2e/playwright.config.ts](../../e2e/playwright.config.ts) et montre les
   trois `projects`.
2. **La CI.** Sur GitHub, ouvre l'onglet Actions, le workflow **e2e**, et le dernier run sur `main`. Montre
   les six jobs `playwright (chromium, lesson)`, `playwright (chromium, rest)`,
   `playwright (firefox, lesson)`, `playwright (firefox, rest)`, `playwright (webkit, lesson)`,
   `playwright (webkit, rest)`, et le contrôle `playwright (production stack)`, tous verts.
3. **Les tests, lancés en direct.** Dans le devcontainer, avec la stack lancée (après `make` ou
   `make run`) :

   ```bash
   make playwright BROWSERS="firefox webkit"   # the two additional engines
   make playwright-all                         # or all three, as CI does
   make report                                 # serves the report on http://127.0.0.1:9323
   ```

   Dans le rapport, filtre par project (`firefox`, `webkit`) et montre les tests réussis. Montre les
   quelques tests sautés et leur raison. Un run complet prend du temps : lance-le avant les autres modules.

4. **À la main.** Sur la machine de l'évaluateur, ouvre l'adresse affichée par `make` (par exemple
   <https://localhost>) dans Firefox, puis dans Safari s'il y a un Mac. Ouvre la console de développement
   du navigateur. Va sur `/en/login`, clique sur **Create one**, inscris-toi et passe l'onboarding. Ouvre une
   leçon. La console reste vide. Dans Firefox, on peut jouer un plateau à glisser en faisant glisser les options.

## Les tests qui le prouvent

Chaque spec de [e2e/tests/](../../e2e/tests/) tourne sur les trois moteurs, sauf si elle dit le contraire.
Celles-ci comptent le plus pour ce module :

| Test                                                                                                                                                                                 | Ce qu'il vérifie                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [e2e/tests/console.spec.ts](../../e2e/tests/console.spec.ts)                                                                                                                         | Chaque route de `e2e/support/routes.ts`, déconnecté et connecté, et la navigation côté client : pas d'erreur dans la console, pas d'avertissement, pas d'exception non attrapée, pas de requête échouée. Sur les trois moteurs.                                                          |
| [e2e/tests/lesson.spec.ts](../../e2e/tests/lesson.spec.ts)                                                                                                                           | « plays from the lesson page to the results, which stay » et les autres tests de leçon de grammaire ; « plays to the results in a browser with no voice » (vocabulaire) ; « plays to the results in a browser with no voice, through Show the text » (functions). Sur les trois moteurs. |
| [e2e/tests/layout.spec.ts](../../e2e/tests/layout.spec.ts)                                                                                                                           | Chaque page des listes de routes, et les pages du placement, tiennent dans un écran de téléphone de 360 px de large, sur chaque moteur.                                                                                                                                                  |
| [e2e/tests/layout-gate.spec.ts](../../e2e/tests/layout-gate.spec.ts)                                                                                                                 | La vérification de largeur de téléphone elle-même, sur chaque moteur. Elle met `isMobile` sauf sur Firefox, et vérifie la mise à jour tardive du viewport sur WebKit.                                                                                                                    |
| [e2e/tests/auth.spec.ts](../../e2e/tests/auth.spec.ts), [e2e/tests/course.spec.ts](../../e2e/tests/course.spec.ts), [e2e/tests/time-zone.spec.ts](../../e2e/tests/time-zone.spec.ts) | Ils attendent qu'une redirection ou un rafraîchissement soit fini avant la page suivante. Sans cette attente, Firefox et WebKit signalent la navigation comme interrompue ou annulée, ce que le contrôle de la console attraperait.                                                      |
| [e2e/tests/signup-budget.spec.ts](../../e2e/tests/signup-budget.spec.ts)                                                                                                             | La logique d'attente qui garde les inscriptions sous la limite de requêtes : elle attend la fin d'un 429 (trop de requêtes) et s'arrête après trois.                                                                                                                                     |

## Limites et choix

- **Bureau seulement.** Les trois projects sont les appareils de bureau de Playwright. Les navigateurs mobiles ne sont pas
  testés (README, et « Not in this issue » dans #159).
- **WebKit, pas Safari.** Le WebKit de Playwright est le moteur derrière Safari, pas l'app Safari. Ses
  Firefox et Chromium sont aussi des builds de Playwright, pas les navigateurs officiels.
- **Certains tests tournent seulement sur Chromium.** Sept appels `test.skip` le disent, chacun avec sa raison.
  Trois d'entre eux sautent tout un groupe (« every French A1 ... lesson »), qui contient un test par
  leçon française A1 écrite de ce type (les groupes grammaire et functions laissent de côté la leçon
  que leur test d'une seule leçon joue déjà sur chaque moteur), donc ce groupe grandit avec le contenu :

  | Test                                                                                                              | Raison donnée dans le code                                                                                                                                                                                            |
  | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `restart.spec.ts:28` : « an open page reconnects after an API restart, silently »                                 | Deux démarrages de l'API en 15 minutes déclenchent l'alerte `ApiRestarting`, donc un seul moteur la redémarre : « one restart a run, on Chromium ». Le commentaire dit que Firefox et WebKit sont vérifiés à la main. |
  | `lesson.spec.ts:257` : « says when the time ran out while the learner was away »                                  | L'attente est celle du serveur : « Chromium covers the wait ».                                                                                                                                                        |
  | `lesson.spec.ts:289`, `:409` et `:469` : les groupes « every French A1 grammar / vocabulary / functions lesson » | Les renderers sont déjà testés sur chaque moteur par les tests d'une seule leçon : « Chromium covers the content ».                                                                                                   |
  | `lesson.spec.ts:371` : « shows the Listen buttons once a French voice is there »                                  | La voix est une fausse voix ajoutée dans la page : « The voice is a stub ».                                                                                                                                           |
  | `level-complete.spec.ts:40` : « the level complete card starts the next level »                                   | Il joue via l'API, pas via le navigateur : « API play: the engine adds nothing, the rate limit minutes ».                                                                                                             |

- **Pas de comparaison de captures d'écran.** Les tests vérifient ce qui est à l'écran sur chaque moteur, mais aucun test
  ne compare des captures d'écran entre moteurs.
- **La lecture à voix haute dépend du navigateur.** Sans voix pour la langue, il n'y a pas de boutons
  Listen. On répond à la réponse d'écoute de functions avec **Show the text**. Les vraies voix sur
  Firefox et WebKit ne sont pas testées : les navigateurs headless n'en ont pas, et le test de voix tourne seulement sur
  Chromium.
- **Vitesse.** `make` lance Chromium seul, parce que trois moteurs sur une stack prenaient « most of a
  `make all` » (la plus grande partie d'un `make all`) ([Makefile](../../Makefile)). La CI lance les trois à chaque pull request.

## Qui l'a construit

| Membre  | GitHub             | Ce qu'il a construit                                                                                                                                                                                                                                                                                                                                                                           | Issues et PRs                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bastian | bastian-schnitzler | Les projects `firefox` et `webkit`, les trois moteurs dans la CI, make et le devcontainer, les mots de chaque moteur dans le contrôle de la console, `settle()`, l'espacement des inscriptions et des connexions, la section « Browser support » du README. Plus tard, la correction du glisser-déposer sur Firefox dans le lecteur de leçons et les attentes pour Firefox dans les tests e2e. | [#159](https://github.com/VictorBro/ft_transcendence/issues/159), [#169](https://github.com/VictorBro/ft_transcendence/pull/169), [#177](https://github.com/VictorBro/ft_transcendence/pull/177), [#186](https://github.com/VictorBro/ft_transcendence/pull/186), [#192](https://github.com/VictorBro/ft_transcendence/pull/192) |
| Victor  | VictorBro          | A ouvert #159. A séparé le run CI de chaque moteur en deux parties (#198) et a mis Playwright dans sa propre image (#200) ; `BROWSERS` et `make playwright-all`. La fermeture du socket sur Firefox et la correction de Entrée sur Safari dans le chat.                                                                                                                                        | [#198](https://github.com/VictorBro/ft_transcendence/pull/198), [#181](https://github.com/VictorBro/ft_transcendence/pull/181), [#200](https://github.com/VictorBro/ft_transcendence/pull/200)                                                                                                                                   |
| Endrit  | VYAntares          | Le document de lecture qui peut recevoir le focus, pour que le clavier puisse faire défiler un long texte dans Safari.                                                                                                                                                                                                                                                                         | [#203](https://github.com/VictorBro/ft_transcendence/pull/203)                                                                                                                                                                                                                                                                   |
| Luca    | luca-mattei        | La page de toutes les leçons et ses tests e2e, dont un qui a attrapé une remise à zéro de la zone de recherche qui arrivait surtout sur WebKit ; le test de discussion qui autorise la ligne 429 que Chromium et WebKit affichent.                                                                                                                                                             | [#196](https://github.com/VictorBro/ft_transcendence/pull/196), [#205](https://github.com/VictorBro/ft_transcendence/pull/205)                                                                                                                                                                                                   |
