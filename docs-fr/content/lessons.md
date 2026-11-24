# Leçons : contenu, seed et déroulé

Ce qu'est une leçon, combien il y en a, comment elles sont planifiées, écrites, vérifiées et
chargées (seed), comment un apprenant en joue une, et comment une tentative est notée.
[architecture/product.md](../architecture/product.md) explique comment l'objectif du jour et la page
de toutes les leçons s'en servent,
[architecture/overview.md](../architecture/overview.md) §5 suit les routes, et
[architecture/realtime.md](../architecture/realtime.md) §4 le flux de la discussion. Pourquoi le
modèle de leçon est celui du prototype de leçon est expliqué dans
[#137](https://github.com/VictorBro/ft_transcendence/issues/137).

Pour qui : la personne qui écrit un plan (outline), lance le kit d'écriture, vérifie un niveau, ou
doit expliquer la boucle des leçons pendant l'évaluation.

---

## 0. Quatre mots faciles à confondre

| Terme                              | Ce que c'est                                                                                            | Où ça vit                                                         | Combien aujourd'hui                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Entrée de plan** (outline entry) | Le plan d'une leçon : id, type, topic ou theme, titre provisoire, intention                             | `content/outlines/<lang>-<level>.json`, commité                   | 3 990 (1 330 par langue)                                                      |
| **Leçon écrite** (authored lesson) | Les fichiers de la leçon : un brief, plus un fichier de contenu pour tous les types sauf le vocabulaire | `content/briefs/<id>.json`, `content/lessons/<id>.json`, commités | 216 briefs, 108 fichiers de contenu                                           |
| **Leçon chargée** (seeded lesson)  | Une ligne `Lesson` par entrée de plan, écrite par `db:seed`                                             | Postgres                                                          | 3 990 : chaque entrée, écrite ou non                                          |
| **Leçon prête** (ready lesson)     | Une leçon chargée dont les fichiers existent et passent `validateLesson` : `Lesson.ready = true`        | Postgres                                                          | 216 : les 12 premières par position de chacune des 18 paires langue et niveau |

**Tout ce qui est dans `content/` est écrit hors ligne et commité.** Le seed ne fait que le lire.
Aucune leçon, aucun brief, aucun plan n'est généré à l'exécution, au moment du deploy ou dans
l'image d'outillage : l'image contient les fichiers (§4), et le seed les copie dans la base. Le seul
appel au LLM qu'un apprenant provoque dans une leçon est la discussion (§12), et elle ne change rien
de ce qui est stocké.

---

## 1. Ce qu'est une leçon

Une leçon est une ligne d'un **catalogue chargé par le seed**. Son plan est une entrée de plan et son
corps tient dans un ou deux fichiers JSON, tous commités dans le repo et chargés par `db:seed`.

| Type         | Ce qu'il enseigne                                                           | Classé par |
| ------------ | --------------------------------------------------------------------------- | ---------- |
| `grammar`    | Un point de grammaire, par exemple les articles définis                     | `topic`    |
| `vocabulary` | Un ensemble de mots sur un thème, par exemple les boissons au café          | `theme`    |
| `functions`  | Une chose à faire avec la langue, par exemple saluer ou prendre rendez-vous | `theme`    |
| `reading`    | Comprendre un type de texte court, par exemple une invitation               | `theme`    |

Une leçon de grammaire a un `topic` et pas de `theme`. Les trois autres types ont un `theme` et pas
de `topic`. Jamais les deux, jamais aucun.

**Topics** (13), les catégories de grammaire que la banque de questions utilise déjà
([content/item-bank.md](item-bank.md) §4) :

```
nouns_and_determiners      pronouns                  verbs_morphology
verb_usage                 syntax_and_sentence_structure
subordinate_clauses        prepositions_and_case     adjectives
adverbs                    agreement                 negation
comparison_and_quantity    information_structure_and_pragmatics
```

**Themes** (14), les thèmes du Niveau seuil (Threshold Level) du Conseil de l'Europe. Ses versions
allemande, anglaise et française gardent les mêmes thèmes, donc une seule liste sert pour de, en et
fr :

```
personal_identification    house_and_home    daily_life      free_time
travel                     relations         health          education
shopping                   food_and_drink    services        places
language                   weather
```

**Le modèle de leçon** est celui du prototype de leçon
([lesson_prototype](https://github.com/bastian-schnitzler/lesson_prototype), `schemaVersion: 2`,
figé au commit `928484d`). Une leçon est complète et jouable : quoi enseigner, les exercices, leurs
corrigés, un examen et la façon de le noter. Ses schemas et ses validateurs sont dans `@ft/shared`,
sous `packages/shared/src/lessons/` (#135, #136), exportés sous le namespace `lessons`.

- **Le brief** (`content/briefs/<id>.json`, tous les types) contient le plan de la leçon : le titre,
  l'objectif, les mots, règles, expressions ou documents, et l'examen.
- **Le contenu** (`content/lessons/<id>.json`, tous les types sauf le vocabulaire) contient la leçon
  telle que l'apprenant la joue : étapes, pages et items. Une leçon de vocabulaire n'a pas de
  fichier de contenu : sa leçon est déduite de son brief.
- Les deux commencent par la même enveloppe : `schemaVersion`, `id`, `kind`, `lang`, `level`,
  `locales`, `title`, `objective`, `estimatedMinutes` et `provenance`.

**Les langues dans une leçon.** Ce qu'on apprend (mots, phrases, textes, réponses) est dans la langue
du cours. L'aide autour (l'objectif, les consignes, les traductions) est en anglais, en français et
en allemand, pour que la leçon marche avec chaque langue d'interface. Laquelle des trois le lecteur
utilise dépend de la règle de la langue maternelle (§11).

**Ce que l'apprenant voit avant de l'ouvrir.** Le titre, dans la langue du cours, et un résumé :
l'objectif dans la langue du cours. Les deux apparaissent sur la page de l'objectif du jour et sur la
page de toutes les leçons, et la recherche texte les prend en compte. Un titre fait au plus 80
caractères et un résumé au plus 200.

**Combien de temps dure une leçon.** L'objectif du jour compte des leçons : 10, 30 ou 60 minutes
veulent dire 1, 3 ou 6 leçons finies dans la journée (`LESSON_MINUTES = 10`). Les leçons prêtes sont
prévues plus longues que ça : leur `estimatedMinutes` va de 8 à 37, avec une médiane de 17,5. Savoir
si l'objectif continue de compter des leçons ou si le kit garde des leçons plus proches de dix
minutes est encore une question ouverte pour l'équipe
([architecture/product.md](../architecture/product.md) §1.3).

---

## 2. Nombres par niveau et par type

Les plans ont la même taille pour de, en et fr : 1 330 entrées par langue, 3 990 en tout.

| Niveau | Leçons | Plage autorisée |
| ------ | ------ | --------------- |
| A1     | 120    | 100 à 140       |
| A2     | 150    | 130 à 180       |
| B1     | 230    | 200 à 270       |
| B2     | 250    | 210 à 300       |
| C1     | 260    | 220 à 320       |
| C2     | 320    | 260 à 400       |

Les nombres sont exacts : ils sont dans `LESSONS_PER_LEVEL` (`packages/shared/src/schemas/lesson.ts`)
et la CI refuse un plan qui a une entrée de plus ou de moins. Pour changer un nombre, ouvre une PR
qui change la constante et `KIND_COUNTS` avec, pour les trois langues à la fois, et qui reste dans la
plage autorisée. Chaque langue garde le même nombre : les différences vont dans les nombres par type.

**Leçons par type**, d'après `KIND_COUNTS[lang][level]`. L'allemand et le français ont plus de
grammaire de A1 à B1, l'anglais plus de vocabulaire de B1 à C2.

Allemand et français :

| Niveau | Grammaire | Vocabulaire | Fonctions | Lecture |
| ------ | --------- | ----------- | --------- | ------- |
| A1     | 48        | 48          | 14        | 10      |
| A2     | 60        | 52          | 18        | 20      |
| B1     | 68        | 100         | 22        | 40      |
| B2     | 50        | 125         | 30        | 45      |
| C1     | 26        | 130         | 32        | 72      |
| C2     | 26        | 166         | 32        | 96      |

Anglais :

| Niveau | Grammaire | Vocabulaire | Fonctions | Lecture |
| ------ | --------- | ----------- | --------- | ------- |
| A1     | 42        | 54          | 14        | 10      |
| A2     | 50        | 60          | 20        | 20      |
| B1     | 46        | 122         | 22        | 40      |
| B2     | 38        | 136         | 30        | 46      |
| C1     | 14        | 142         | 30        | 74      |
| C2     | 16        | 182         | 32        | 90      |

Ces nombres sont exacts eux aussi : la CI exige le nombre de chaque type, sans tolérance. Chaque type
existe à chaque niveau des plans.

### Ce qui est prêt aujourd'hui

12 leçons par langue et niveau sont écrites, les 12 premières entrées de chaque plan : 18 × 12 =
**216 leçons prêtes**. Les leçons prêtes forment toujours le début de leur plan, sans trou (une
vérification du §8 l'impose), donc « la prochaine leçon à écrire » est toujours la 13e, puis la 14e.

|                        | Vocabulaire | Grammaire | Fonctions | Lecture | Toutes |
| ---------------------- | ----------- | --------- | --------- | ------- | ------ |
| Prêtes, les 18 niveaux | 108         | 61        | 26        | 21      | 216    |

La répartition par niveau suit l'ordre de chaque plan, pas `KIND_COUNTS`. Les 18 niveaux ont des
leçons de vocabulaire et de grammaire prêtes, 16 ont des fonctions (pas en C1 ni fr C2) et 13 ont
de la lecture (pas de A1, en A1, fr A1, fr C1 ni fr C2). Un défi du jour qui demande un type n'est
tiré que si le niveau a une leçon prête de ce type (#95).

**Le français A1** est le niveau de démo et celui où tous les tests e2e font l'onboarding. Ses
douze premières leçons sont arrivées dans la PR #171 (#84) : dix copiées du prototype de leçon
(`lesson_prototype` à `c806f47`), et deux leçons de fonctions, `fr-introducing-yourself` et
`fr-thanking-and-apologising`, écrites avec l'outil d'écriture de fonctions du prototype
(bastian-schnitzler/lesson_prototype#121). La PR #183 (#93) a ensuite réécrit les douze avec le kit
d'écriture du §7, avec le reste du français, donc les fichiers sur `main` viennent du kit pour les
18 niveaux (#91 à #93) : leur `provenance` indique `ft lessons:author`.

### D'où viennent les nombres

Trois angles, chacun estimé par niveau, puis mis en accord et arrondis à la dizaine :

| Angle           | Ce qu'il compte                                                                                                                                                                                                                           | Poids                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Inventaires     | Les listes publiées de grammaire, vocabulaire, fonctions et types de textes par niveau, à environ 3 points de grammaire ou 12 à 15 mots nouveaux par leçon                                                                                | Environ un tiers     |
| Heures          | Les heures d'apprentissage guidé par niveau données par les instituts de langue, avec environ 22 % de ce temps en leçons de dix minutes de contenu nouveau. Toutes les sources sont officielles, et c'est le seul angle qui va jusqu'à C2 | Environ la moitié    |
| Apps et manuels | Busuu, Duolingo, Lingoda et Cosmopolite, qui plafonnent en haut et s'arrêtent avant C2                                                                                                                                                    | Environ un cinquième |

- Les trois arrivent à 120 à 130 pour A1.
- Le grand saut est de A2 à B1. De B2 à C1, c'est presque plat. C2 est extrapolé.

Sources principales :

- Cambridge English, heures d'apprentissage guidé :
  https://support.cambridgeenglish.org/hc/en-gb/articles/202838506-Guided-learning-hours
- LanguageCert, heures d'apprentissage guidé par niveau : https://www.languagecert.org/en/guided-learning-hours
- Busuu, 99 leçons de français A1 en environ 25 heures : https://www.busuu.com/en/languages/how-long-learn-language
- Duolingo, environ 800 mots en A1 et en A2 : https://blog.duolingo.com/how-are-duolingo-courses-evolving
- English Vocabulary Profile, mots nouveaux par niveau (Capel 2010) :
  https://www.cambridge.org/core/journals/english-profile-journal/article/a1b2-vocabulary-insights-and-issues-arising-from-the-english-profile-wordlists-project/E57847F6C5574124B2354F9BEEC005FA
- Liste de mots du Goethe-Zertifikat B1 : https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf
- British Council et EAQUALS Core Inventory for General English :
  https://www.eaquals.org/wp-content/uploads/EAQUALS_British_Council_Core_Curriculum_April2011.pdf
- Inventaire linguistique des contenus clés des niveaux du CECRL :
  https://www.eaquals.org/wp-content/uploads/Inventaire_ONLINE_full.pdf

---

## 3. Les plans (outlines)

Un plan par langue et par niveau, `content/outlines/<lang>-<level>.json` : le plan ordonné du
niveau. Les noms de fichiers sont en minuscules (`fr-a1.json`) et doivent correspondre au `lang` et
au `level` à l'intérieur, où le niveau est en majuscules :

```json
{ "lang": "fr", "level": "A1", "entries": [ ... ] }
```

Une **entrée** est `{ id, kind, topic?, theme?, workingTitle, intent }`. Le titre provisoire et
l'intention font une ligne chacun, dans la langue du cours. Une entrée n'a pas de `lang`, `level` ni
`position` : le seed les ajoute. **La position est la place de l'entrée dans le fichier**, à partir
de 1. L'ordre compte : aucune leçon n'est verrouillée, mais l'objectif du jour propose les leçons
prêtes les plus basses pas encore réussies, donc l'ordre est le parcours que suit l'apprenant, et le
début de chaque plan est ce qu'on écrit en premier.

L'entrée 2 de `content/outlines/fr-a1.json`, donc la position 2 du français A1 :

```json
{
  "id": "fr-subject-pronouns",
  "kind": "grammar",
  "topic": "pronouns",
  "workingTitle": "Les pronoms je, tu, il, elle…",
  "intent": "Employer les pronoms sujets je, tu, il, elle, on, nous, vous, ils et elles, choisir tu ou vous selon la personne, ils ou elles selon le groupe, et on pour dire nous à l'oral."
}
```

**Avant que ses fichiers existent**, sa ligne `Lesson` a `title` = le titre provisoire, `summary` =
l'intention, un brief vide, pas de contenu et `ready = false`
([#134](https://github.com/VictorBro/ft_transcendence/issues/134)). Ainsi chaque niveau est listé et
peut être cherché dès le premier jour, et la page de toutes les leçons affiche ces lignes comme
"Coming soon" (« Bientôt »). Seule une leçon prête (§4) peut être jouée.

**Écrire un plan :**

- Exactement le nombre du niveau, avec les nombres par type du §2.
- Un seul sujet par leçon.
- Chaque leçon s'appuie sur les précédentes, et sur les niveaux en dessous.
- Deux entrées n'enseignent jamais la même chose, sur les six niveaux de la langue.
- Un LLM peut écrire le premier brouillon. Une personne qui parle couramment la langue lit ensuite
  chaque entrée (§8).

**Avec Claude Code :** `/outline-language <lang>`, par exemple `/outline-language es`, écrit le
premier brouillon des six plans d'une langue, comme l'anglais et l'allemand ont été écrits. Il
étudie les inventaires et les examens de la langue par niveau, planifie toutes les entrées des six
niveaux en une fois, ordonne chaque niveau, fait relire chaque niveau deux fois (programme et
locuteur natif), et vérifie que chaque leçon a un seul sujet. Il demande d'abord la variété standard,
les conventions de titre par type et les relecteurs, et laisse la lecture du §8 aux humains. La
langue doit déjà être dans `LEARNABLE_LANGUAGES` et `KIND_COUNTS`. Les instructions sont dans
`.claude/skills/outline-language/SKILL.md`, les étapes dans `.claude/workflows/outline-language.js`.

**Lire un plan en entier.** Le JSON est difficile à lire dans l'ordre, alors affiche une ligne par
entrée : position, type, topic ou theme, titre provisoire. Lis-le de haut en bas comme le parcours
que suit l'apprenant, et compare les nombres par type avec le §2 :

```bash
jq -r '.entries | to_entries[] | "\(.key + 1)\t\(.value.kind)\t\(.value.topic // .value.theme)\t\(.value.workingTitle)"' content/outlines/fr-a1.json
jq -r '.entries | group_by(.kind)[] | "\(.[0].kind)\t\(length)"' content/outlines/fr-a1.json
```

---

## 4. Les fichiers de leçon, le seed et le drapeau ready

| Fichier                     | Types                       | Contient                                                               |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `content/briefs/<id>.json`  | les quatre                  | L'enveloppe et le plan de la leçon                                     |
| `content/lessons/<id>.json` | grammar, functions, reading | L'enveloppe et la leçon telle qu'elle est jouée : étapes, pages, items |

Les `id`, `kind`, `lang`, `level` et `topic` ou `theme` des deux fichiers doivent correspondre à
l'entrée de plan, et le fichier de contenu reprend mot pour mot le `title` et l'`objective` du brief.

### Ce que fait le seed

`db:seed` (`apps/api/prisma/seed.ts`) tourne après chaque migration : `make`, `make seed`, et le
service `migrate` d'un déploiement ([operations/deployment.md](../operations/deployment.md) §5).
Pour les leçons, `seedLessons` :

1. Lit chaque plan et crée une ligne par entrée, avec sa position, title = titre provisoire,
   summary = intention, brief `{}`, contenu null et `ready = false`. Un id en double arrête le seed.
2. Liste `content/briefs/` et `content/lessons/`. Un fichier qu'aucune entrée ne prévoit, ou un
   fichier de contenu sans brief, arrête le seed.
3. Lance `validateLesson` sur chaque brief, avec son fichier de contenu quand le type en a un.
   **Une leçon invalide arrête le seed**, avec l'id et chaque problème : un fichier cassé échoue
   bruyamment, il ne devient jamais une ligne discrètement pas prête. Une leçon valide met le titre
   de la ligne au titre de l'enveloppe, son résumé à l'objectif dans la langue du cours, son `brief`
   et son `content` aux fichiers lus, et `ready = true`.
4. Refuse de tourner si la base contient une leçon qu'aucun plan n'a (sauf les fixtures de spec avec
   un id `<lang>-test-`) : une leçon livrée est modifiée ou déplacée, jamais supprimée.
5. N'écrit que les lignes qui ont changé, dans une seule transaction. Une ligne dont le brief ou le
   contenu a changé perd aussi ses tentatives non finies dans la même transaction, car leurs pages
   et leurs réponses pointent vers l'ancienne leçon. Les tentatives finies et les résultats restent.

Il affiche `seeded N lessons`, où N compte seulement les lignes nouvelles ou modifiées, donc un
deuxième passage affiche 0.

### Ce que veut dire `ready`

`Lesson.ready` est calculé à chaque passage, à partir des fichiers seulement. Une leçon devient
prête quand on ajoute ses fichiers et qu'on relance le seed, et cesse de l'être quand on les retire :
pas de migration, et aucune ligne supprimée.

| Qui lit                                                                                                  | Ce qui est utilisé                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| La proposition du jour et la progression du niveau (`plan()`, `levelProgress()` dans `roadmap.rules.ts`) | Seulement les leçons prêtes. Un cours de français A1 a `progress.total` 12, et 10 leçons réussies (80 %) le terminent |
| Les routes de tentative et la discussion (§10, §12)                                                      | Seulement les leçons prêtes : tout le reste donne 404 `lesson.notFound`                                               |
| La page de toutes les leçons et `GET lessons`                                                            | Toutes les lignes. Une ligne pas prête a le statut `soon` et affiche "Coming soon" (« Bientôt »)                      |
| Le défi du jour (#95)                                                                                    | Un défi de type seulement si le niveau a une leçon prête de ce type                                                   |

Le brief de `fr-subject-pronouns`, raccourci :

```json
{
  "schemaVersion": 2,
  "id": "fr-subject-pronouns",
  "kind": "grammar",
  "lang": "fr",
  "level": "A1",
  "locales": ["en", "fr", "de"],
  "title": "Les pronoms sujets : je, tu, il, elle…",
  "objective": {
    "en": "Use the subject pronouns je, tu, il, elle, on, nous, vous, ils and elles, choose tu or vous, ils or elles, and use on for nous in everyday speech.",
    "fr": "Employer je, tu, il, elle, on, nous, vous, ils et elles, choisir tu ou vous, ils ou elles, et dire on à la place de nous à l'oral.",
    "de": "Die Subjektpronomen je, tu, il, elle, on, nous, vous, ils und elles verwenden, tu oder vous, ils oder elles wählen und on statt nous im Alltag benutzen."
  },
  "estimatedMinutes": 16,
  "provenance": {
    "generator": "…",
    "model": "…",
    "promptVersion": "…",
    "generatedAt": "…",
    "inputHashes": { "outline": "…" }
  },
  "topic": "pronouns",
  "rules": ["…"],
  "blocks": ["…"],
  "exam": { "…": "…" },
  "scoring": { "practiceWeight": 35, "examWeight": 65, "orthographyCredit": 0.5 }
}
```

La forme complète de chaque type est dans les schemas de `packages/shared/src/lessons/schemas/`, et
carte par carte dans [milestone2-data-model.html](../../site/milestone2-data-model.html#files).

### Qui transporte les fichiers, et où

| Moment                               | Ce qui arrive à `content/`                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Écriture, sur la machine d'un membre | Le kit du §7 écrit `briefs/` et `lessons/` ; des humains écrivent `outlines/` et `items/`. Tout est commité                                 |
| CI                                   | Les specs du §8 valident chaque fichier                                                                                                     |
| Build de l'image                     | L'image `tooling` (le stage `build` du Dockerfile de l'api) copie le repo, `content/` compris. L'image d'exécution `api` ne le contient pas |
| Deploy                               | Le service `migrate` lance `prisma migrate deploy`, puis `db:seed`, depuis l'image tooling                                                  |
| Exécution                            | L'api lit les leçons uniquement depuis Postgres. Rien n'écrit de ligne `Lesson`                                                             |

---

## 5. Les ids

| Règle                                                                                     | Pourquoi                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `<lang>-<English words>` : `de-separable-verbs`, pas `de-trennbare-verben`                | Tout le monde dans l'équipe peut lire les ids de chaque langue |
| Pas de niveau dedans                                                                      | Une leçon peut changer de niveau et garder son id              |
| Lettres minuscules de `a` à `z` et tirets simples, pas de chiffres, 64 caractères au plus | Il va dans les URLs : `/learn/de/lessons/de-separable-verbs`   |
| Unique sur les six plans de la langue                                                     | C'est la clé primaire de `Lesson`, et le nom de ses fichiers   |
| **Permanent une fois sur `main`**                                                         | Les résultats des apprenants y sont rattachés                  |

Une fois qu'un id est sur `main`, tu peux changer le titre, réécrire ou déplacer la leçon, mais
jamais la renommer ni la supprimer. Le seed échoue si la base a un id qu'aucun plan n'a, sauf les ids
`<lang>-test-` que les specs donnent à leurs leçons de fixture.

---

## 6. Déplacer une leçon vers un autre niveau

Une seule PR :

1. Déplace son entrée de plan dans le fichier de l'autre niveau, avec le même id.
2. Déplace une leçon du même type dans l'autre sens, pour que les nombres des deux niveaux restent
   exacts.
3. Supprime les fichiers des deux leçons et réécris-les avec le kit d'écriture : une leçon est écrite
   pour son niveau, donc les anciens fichiers ne vont plus.

Le seed met à jour `level` et `position`, et les résultats restent rattachés à l'id.

---

## 7. Écrire les leçons

Les leçons sont écrites avec **Claude Code**, sur l'abonnement de chaque membre : pas de clé d'API,
pas de coût par leçon. Le modèle écrit le texte de la leçon ; le kit d'écriture
(`apps/api/scripts/lessons/`) écrit le reste (l'enveloppe, la provenance, chaque durée et chaque
temps limite), vérifie le résultat avec `validateLesson` et renvoie les problèmes jusqu'à ce que la
leçon soit valide. Les fichiers sont écrits une fois, commités, et ensuite seulement lus (§0).

**Niveau de qualité : une leçon qui passe les validateurs et n'a pas d'erreur grossière est assez
bonne.** Personne ne relit chaque leçon à la main.

**Quoi écrire ensuite**, c'est toujours le début d'un niveau : les premières entrées par position qui
n'ont pas encore de fichiers. Les leçons prêtes doivent rester un début de plan sans trou (§8), et
les deux façons ci-dessous choisissent exactement ces entrées.

### Installation

1. Installe Claude Code et connecte-toi une fois (`claude`, puis `/login`). Dans le dev container, le
   binaire de l'extension VS Code suffit : le kit le trouve.
2. `make doctor` passe, et `pnpm install` a été lancé.

### Lancer un niveau

Deux façons, les mêmes vérifications. Les deux sautent une leçon qui a déjà des fichiers.

|                    | Dans une session Claude Code                                  | Sans surveillance                                                                                              |
| ------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Commande           | `/author-lessons de c1`                                       | `pnpm --filter @ft/api lessons:author de c1`                                                                   |
| Leçons             | les 12 prochaines entrées sans fichiers, ou les ids donnés    | les 12 prochaines entrées sans fichiers (`--max`), ou `--only`                                                 |
| Qui écrit          | la session, qui vérifie chaque brouillon avec `lessons:check` | `claude -p`, sans accès au repo ; au plus `--attempts` réponses par leçon, la première comprise (4 par défaut) |
| Erreurs grossières | la session lit chaque leçon une fois                          | pas lues : lis-en quelques-unes par type avant la PR                                                           |
| Échecs             | listés dans le compte rendu final                             | dernier brouillon et problèmes dans `$TMPDIR/ft-lessons-author/failed/`                                        |

`lessons:author` écrit chaque leçon dès qu'elle passe, donc un passage interrompu ne perd que les
leçons en cours. Ses autres options : `--concurrency` (2 par défaut), `--model` (`sonnet` par
défaut), `--effort` et `--timeout` (minutes par réponse, 15 par défaut). Une courte limite de débit
est retentée après 30 s, 1 min et 2 min. Quand la limite d'usage de l'abonnement est atteinte, ou que
la limite de débit dure plus longtemps que les relances, il s'arrête, et le passage suivant reprend
là où il s'est arrêté.

Vérifier une leçon, à la main ou avec n'importe quel autre modèle :

```bash
pnpm --filter @ft/api lessons:check <id> --rules                    # the rules and the outline entry, to give the model
pnpm --filter @ft/api lessons:check <id> --draft draft.json         # complete + validateLesson, every issue printed
pnpm --filter @ft/api lessons:check <id> --draft draft.json --write # and write content/ when it passes
```

Un brouillon est `{"brief":{…},"content":{…}}`, sans le contenu pour le vocabulaire ou tant que seul
le brief est écrit.

### Refaire une leçon

Supprime `content/briefs/<id>.json` et `content/lessons/<id>.json`, puis lance l'une des deux façons
avec cet id (`/author-lessons <lang> <level> <id>`, ou `lessons:author <lang> <level> --only <id>`).
Le kit n'écrase jamais un fichier.

### Temps par leçon

Mesuré sur de vrais passages ; `lessons:author` affiche ces chiffres à la fin de chaque passage.

| Niveau | Façon                         | Modèle | Vocabulaire | Grammaire  | Fonctions  | Lecture    |
| ------ | ----------------------------- | ------ | ----------- | ---------- | ---------- | ---------- |
| de C1  | `lessons:author`, 4 à la fois | sonnet | 2 min 14 s  | 5 min 18 s | 4 min 44 s | 2 min 27 s |

---

## 8. Vérifications

### Automatiques

Des tests dans `apps/api/src/lessons/` vérifient chaque fichier, donc tu as la réponse en quelques
secondes au lieu d'attendre la CI :

```bash
pnpm --filter @ft/api test src/lessons/outline-files.spec.ts   # the outlines
pnpm --filter @ft/api test src/lessons/lesson-files.spec.ts    # the lesson files
pnpm --filter @ft/api outlines:check <lang>                    # one language's outlines, while writing
pnpm --filter @ft/api lessons:check <id>                       # one lesson, while writing (section 7)
make                                                           # everything, before the PR
```

Un échec indique le fichier et l'entrée. `outlines:check` vérifie aussi ce que les specs laissent aux
relecteurs : l'ordre des clés, pas de niveau dans un id, et pas de tirets longs, de guillemets ni de
doubles espaces. Ajoute `--level B1` pour ne voir que les problèmes de ce fichier quand plusieurs
personnes se partagent une langue.

| Vérification      | Règle                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier de plan   | Se lit comme `{ lang, level, entries }`, nommé d'après sa langue et son niveau                                                                                                                                                                                                                                                                                               |
| Nombres           | Exactement `LESSONS_PER_LEVEL[level]` entrées, et chaque type exactement son `KIND_COUNTS`                                                                                                                                                                                                                                                                                   |
| Topic et theme    | `topic` uniquement sur la grammaire, `theme` uniquement sur les autres                                                                                                                                                                                                                                                                                                       |
| Ids               | Commencent par la langue du fichier, uniques sur les six fichiers de la langue. Aucun ne commence par `<lang>-test-`, un préfixe réservé aux fixtures de spec                                                                                                                                                                                                                |
| Fichiers de leçon | Passent `validateLesson`, la vérification que lance le seed : la forme de chaque type, les règles de la leçon (longueur, nombres, références entre les parties, articles), les durées à la seconde près, un titre de 80 caractères au plus et un objectif dans la langue du cours de 200 au plus. Chaque fichier a une entrée de plan, et chaque fichier de contenu un brief |
| Leçons prêtes     | Dans chaque niveau, les leçons qui ont des fichiers (les prêtes) sont ses premières entrées par position, sans trou                                                                                                                                                                                                                                                          |

Après le seed, les positions vont exactement de 1 à N pour chaque langue et niveau.
`seed.e2e-spec.ts` vérifie que les lignes prêtes sont exactement les leçons qui ont des fichiers.

### Par des humains

Les vérifications attrapent les formes, pas les erreurs.

- **Un plan :** la personne responsable de la langue lit chaque entrée (ordre, bon niveau, un seul
  sujet, pas de doublon), et un deuxième lecteur qui parle couramment la langue vérifie au moins 20
  entrées par niveau. La PR dit qui les a lues et ce qui a changé.
- **Les leçons :** dans chaque PR, lis quelques leçons de chaque type pour repérer les erreurs
  grossières : la mauvaise langue, du charabia, un corrigé faux, un examen qui ne correspond pas à la
  leçon. Quand un guide aurait pu éviter l'erreur, corrige le guide dans la même PR.

---

## 9. Droits d'auteur

**Écris à partir des descripteurs du CECRL et des connaissances du modèle. Ne copie jamais le texte
d'un inventaire, d'une liste de mots, d'un cours ou d'un test publié.** Tu peux consulter Profile
Deutsch, les listes de mots Goethe, l'English Vocabulary Profile ou l'Inventaire linguistique pour
juger ce qui va à un niveau, mais les entrées, les phrases et les textes doivent être les nôtres. La
même règle vaut pour la banque de questions ([content/item-bank.md](item-bank.md) §1).

---

## 10. Notation

**Le serveur gère chaque tentative, et aucune route ne prend un score.** Il n'envoie que la page où
se trouve l'apprenant, vérifie chaque réponse, gère le minuteur de l'examen, et enregistre le
résultat à partir des réponses qu'il a stockées
([#145](https://github.com/VictorBro/ft_transcendence/issues/145)). Les règles de la tentative sont
les fonctions pures de `lessons.player` dans `@ft/shared` (#144) ; `AttemptsService` dans
`apps/api/src/lessons/` stocke leur état et les exécute.

| Route, sous `/api/courses/:lang/lessons/:id` | Corps                             | Réponse                                                                                                |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET attempt`                                | aucun                             | `AttemptRead` : `{ outline, attempt }`, en lecture seule ; `attempt` vaut null avant le premier départ |
| `POST attempt`                               | `{ locale }`                      | `AttemptView` : 201 une nouvelle tentative, ou 200 celle en cours                                      |
| `POST attempt/pages/:index`                  | `{ attemptId, answers }`          | `PageResult` : 200 `{ feedback, attempt }`                                                             |
| `POST discussion`                            | `{ attemptId, message, history }` | Un flux Server-Sent Events (§12)                                                                       |

Chacune répond 404 pour un cours ou une leçon qui n'existe pas, ou une leçon pas prête, et 409
`course.notPlaced` pour un cours sans niveau.

### La tentative

Une ligne `LessonAttempt` par cours et par leçon : la langue maternelle, fixée au départ ; un secret
de 32 octets aléatoires, jamais envoyé ; le curseur (la page où est l'apprenant) ; la date limite de
la page d'examen au curseur ; les réponses verrouillées ; et, quand la dernière page est verrouillée,
les résultats. Le plan, c'est-à-dire la leçon sous forme de pages d'unités de réponse, n'est jamais
stocké : chaque requête le reconstruit depuis la ligne de la leçon avec `buildPlan` (§11).

### Les corrigés restent sur le serveur jusqu'au verrouillage

Le navigateur reçoit la page au curseur et rien d'autre : pas de réponse acceptée, de bon choix, de
bon ordre, de mot fautif ni d'explication. Les unités, les choix et les jetons sont désignés par des
refs, pas par des ids : une ref est le HMAC-SHA256 du chemin de l'item avec le secret de la
tentative, en base64url, coupé à 16 caractères. La même tentative donne toujours les mêmes refs, donc
rien n'est stocké pour les relire ; une autre tentative en donne d'autres, donc une ref venant de la
tentative d'un ami donne un 400. Les listes mélangées sont triées par ref, donc une nouvelle
tentative a un nouvel ordre.

Une page d'entraînement montre sa correction une fois ses réponses verrouillées, pour cette page
seulement. Une page d'examen n'en montre aucune. Tout arrive dans les résultats, quand la dernière
page est verrouillée. Chaque réponse sort par son schema partagé strict, donc un corrigé ne peut pas
sortir par erreur.

### Seulement vers l'avant

Seule la page au curseur est prise, une seule fois, et le curseur ne fait qu'avancer. Un autre index,
la même page une deuxième fois, un ancien `attemptId` ou une tentative finie donne 409
`attempt.stale` : la page relit alors la tentative pour montrer où en est l'apprenant. Une ref
inconnue ou une réponse du mauvais type donne 400 `attempt.invalidAnswer`, et rien n'est verrouillé.
Une unité vide vaut 0.

Chaque écriture est une seule transaction qui verrouille d'abord le cours, puis la ligne de la
tentative. Deux envois de la même dernière page donnent une seule fin : le second trouve la tentative
finie.

### Le minuteur de l'examen

La date limite d'une page d'examen est fixée quand le serveur l'envoie : maintenant plus la limite de
la page. Les réponses qui arrivent avant la date limite plus 2 secondes de marge réseau (`GRACE_MS`
dans `player/attempt.ts`, la même marge que `NETWORK_GRACE_S` du test de niveau) sont notées. Après,
la page n'est même pas lue : chaque unité est verrouillée vide et Out of time (« Temps écoulé »).
`GET attempt` ne démarre jamais un minuteur et ne verrouille jamais une page ; après une date limite,
il affiche 0 ms restantes.

### La fin et le nouvel essai

Quand la dernière page est verrouillée, les résultats sont écrits une fois, et `applyFinish`
enregistre le score dans la même transaction : un nombre entier tiré du total exact, en gardant le
meilleur, puis l'objectif du jour, la série (streak), l'XP, le défi du jour et les succès (#82, #95).
Le meilleur score ne baisse jamais ; un nouvel essai peut le monter, même le même jour. L'objectif du
jour compte une leçon une fois par jour.

Il n'y a pas de redémarrage avant les résultats : avec une tentative en cours, `POST attempt` la
renvoie. Après les résultats, `POST attempt` est un nouvel essai : l'ancienne tentative disparaît, et
une nouvelle arrive avec un nouveau secret, donc de nouvelles refs et un nouvel ordre.

`ft_lesson_attempts_total{lang, event}` compte les tentatives `started` (un nouvel essai aussi) et
`completed` ([operations/monitoring.md](../operations/monitoring.md) §5).

### Ce qu'aucune app web ne peut empêcher

Le serveur garantit qu'un score vient de réponses vraiment envoyées, page par page et à temps. Il ne
peut pas garantir que c'est le travail de l'apprenant lui-même :

- **Les notes.** Un apprenant peut noter ce que la leçon a montré, ses pages de présentation et ses
  corrections d'entraînement, et les lire pendant l'examen, qui teste les mêmes points.
- **L'aide extérieure.** Un dictionnaire, un traducteur, une autre personne ou une IA peut répondre à
  la place de l'apprenant. Le minuteur de l'examen ne fait que ralentir ça.
- **Les corrigés dans ce repository public.** Chaque brief et chaque fichier de leçon, réponses
  acceptées comprises, est commité dans `content/`. Quiconque lit le repository peut connaître toutes
  les réponses.

Donc un score de leçon est un signal pour l'apprenant et pour le plan du jour, pas un certificat.

---

## 11. Jouer une leçon

### Les pages de l'app web

Chaque leçon a trois pages sous `/{locale}/learn/{lang}/lessons/{id}`, toutes rendues sur le serveur
à partir de `GET attempt` :

| Page      | Chemin                   | Affiche                                                                                                                                                                       |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Départ    | `…/lessons/{id}`         | Le titre, l'objectif, les minutes, les sections avec leurs points d'apprentissage numérotés, et Start, Resume ou See the results (Commencer, Reprendre ou Voir les résultats) |
| Lecteur   | `…/lessons/{id}/play`    | La page au curseur, une à la fois, avec le plan dans une barre latérale et le score d'entraînement dans l'en-tête                                                             |
| Résultats | `…/lessons/{id}/results` | Le score, les totaux d'entraînement et d'examen, et chaque réponse avec sa correction                                                                                         |

Le lecteur affiche les items de chaque type avec ses propres composants
(`apps/web/components/lesson/kinds/`), donc il y a quatre expériences de leçon, une par type :

| Type        | Issue | Sur `main`    |
| ----------- | ----- | ------------- |
| Grammaire   | #146  | Oui           |
| Vocabulaire | #147  | Oui           |
| Fonctions   | #149  | Oui           |
| Lecture     | #148  | Oui (PR #203) |

### Le plan

`buildPlan(lesson, motherTongue)` transforme le brief et le contenu d'une leçon en pages d'une
tentative, chacune avec ses unités de réponse. Chaque page a un des cinq rôles (`PageRole`) :

| Rôle           | Ce que c'est                                                                    | Noté               |
| -------------- | ------------------------------------------------------------------------------- | ------------------ |
| `presentation` | Quelque chose à lire, rien à répondre                                           | Non                |
| `practice`     | Des exercices, corrigés page par page                                           | Oui, 35 % du score |
| `discussion`   | La discussion avec le tuteur avant l'examen (§12)                               | Non                |
| `examIntro`    | La page d'infos de l'examen : ses pages, ses questions et ses comptes à rebours | Non                |
| `exam`         | Une page chronométrée, corrigée seulement dans les résultats                    | Oui, 65 %          |

Ce qu'un type fait de différent est dans son module, `packages/shared/src/lessons/player/kinds/`.

### La règle de la langue maternelle

L'aide autour de la leçon (consignes, traductions, consignes en langue maternelle) est dans la
**langue maternelle** de l'apprenant : la langue de l'interface, sauf si c'est la langue du cours
elle-même, et dans ce cas c'est la première autre langue dans l'ordre en, fr, de. Il n'y a pas de
réglage de profil pour ça.

| Interface | Cours | Langue maternelle |
| --------- | ----- | ----------------- |
| de        | fr    | de                |
| fr        | fr    | en                |
| en        | en    | fr                |

Elle est calculée par `motherTongue(locale, lang)` à partir de la `locale` envoyée à `POST attempt`,
et **fixée sur la tentative à son départ** (`LessonAttempt.motherTongue`) : changer la langue de
l'interface au milieu de la leçon ne change pas les consignes ni les traductions attendues de cette
tentative.

### Le vocabulaire sans écoute

Les leçons de vocabulaire du prototype ont deux items d'écoute, un choix à l'écoute et une dictée.
Le lecteur laisse les deux de côté, avec les pages et les étapes qu'ils laissent vides, donc **un
examen de vocabulaire, c'est seulement la traduction**. Le brief n'est pas touché : la coupe se fait
dans le module du type vocabulaire quand le plan est construit.

Les leçons de fonctions gardent leur réponse à l'écoute. Le navigateur lit le texte à voix haute avec
sa synthèse vocale, et **Show the text** (« Afficher le texte ») l'écrit en entier, donc l'exercice
reste faisable quand le navigateur n'a pas de voix pour la langue.

---

## 12. L'étape de discussion

Chaque leçon a une **page de discussion**, non notée, juste avant la page d'infos de l'examen. Le
plan l'ajoute avant la première page d'examen pour chaque type ; l'emplacement réservé au feedback
d'une leçon de grammaire est déjà là et devient cette page. Sur cette page, l'apprenant peut parler
avec le tuteur de la leçon, un LLM, puis passer à l'examen. Sauter la discussion ne coûte rien.

**Ce que voit l'apprenant** (#151) : une fenêtre de chat avec trois suggestions (explique mes
erreurs, un résumé, un exemple), la réponse qui s'affiche au fur et à mesure qu'elle est écrite,
Stop, et les échanges précédents de cette visite. Les échanges vivent seulement dans la page :
quitter la page les oublie.

**Ce que fait le serveur** (#150) : `POST /api/courses/:lang/lessons/:id/discussion` avec
`{ attemptId, message, history }` (`LessonDiscussionSchema`). Il répond en **Server-Sent Events** sur
cette seule réponse : `delta { text }` pour chaque morceau, puis `done {}`, ou `error { code }`, avec
un commentaire `: heartbeat` toutes les 15 s. [architecture/realtime.md](../architecture/realtime.md)
§4 le suit.

| Règle                                        | Comment                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seulement sur la page de discussion          | Le curseur de la tentative doit être sur sa page de discussion, sinon 409 `attempt.stale`. Une fois l'examen commencé, le tuteur n'est plus là                                                                                                                                               |
| Le tuteur connaît la leçon, pas les réponses | Le prompt système est construit sur le serveur à partir d'une sélection des champs d'enseignement du brief, par type. Jamais le fichier de contenu, le plan d'examen du brief, ni le genre et les documents d'une leçon de lecture, car l'examen porte sur un nouveau document du même genre |
| Il peut expliquer les erreurs de l'apprenant | Le prompt contient aussi les mauvaises réponses d'entraînement de la tentative, 20 au plus, lues dans `LessonAttempt.answers`. Jamais les réponses d'examen : aucune n'est verrouillée avant la page de discussion                                                                           |
| Il répond dans la langue de l'interface      | Le prompt demande la langue d'interface de l'apprenant, stockée dans `User.locale` ([#211](https://github.com/VictorBro/ft_transcendence/issues/211)), avec des exemples dans la langue du cours                                                                                             |
| Rien n'est stocké                            | Le navigateur renvoie les 10 derniers échanges avec chaque message. Le serveur ne garde aucune transcription                                                                                                                                                                                 |
| Limité                                       | Un message fait au plus 500 caractères, une réponse au plus 1 000 tokens de sortie, et les limites de l'apprenant par minute et par jour ainsi que la limite globale par minute s'appliquent ([operations/deployment.md](../operations/deployment.md) §5)                                    |

Avec `LLM_PROVIDER=fixture`, le défaut en développement et en CI, le tuteur donne une seule réponse
toute faite. Avec `LLM_PROVIDER=disabled`, chaque message se termine par l'erreur `llm.disabled`.
