# Banque de questions : règles d'écriture

Quoi écrire, et sous quelle forme, pour que les questions du test de niveau puissent être chargées
(seed), servies et jamais répétées pour le même apprenant. Voir
[architecture/product.md](../architecture/product.md) §1.2 pour savoir pourquoi la banque existe.

Pour qui : la personne qui ajoute une langue, ou qui remplace une question qui s'est révélée fausse.

---

## 1. Deux règles

**Ne copie jamais de questions d'un test publié.** Les contenus Goethe et les sites comme
internationalenglishtest.com sont protégés. Tu peux imiter le _format_ librement : questions
courtes, quatre choix chacune, difficulté qui monte au fil de la série. Les _phrases_ doivent être
les nôtres.

**Les questions du test de niveau sont uniquement à choix multiple.** Pas de texte libre, pas de
traduction. Ce sont de bons exercices de leçon et de mauvaises mesures : pour les noter, il faut un
LLM juge, qui est lent pendant que l'apprenant attend, et qui donne des verdicts différents à la
même réponse d'un passage à l'autre, donc deux tests ne sont plus comparables. Le texte libre a sa
place dans les leçons, où une décision au cas par cas sert à enseigner et non à mesurer.

---

## 2. Quoi écrire

|                      |                                    |
| -------------------- | ---------------------------------- |
| Catégories           | `grammar`, `vocabulary`, `reading` |
| Niveaux              | `A1 A2 B1 B2 C1 C2`                |
| Questions par case   | 5                                  |
| **Total par langue** | **90**                             |

Cinq par case, c'est volontairement peu. Un test explore au plus trois niveaux et pose deux
questions par catégorie à chacun, donc deux ou trois tests vident les cases d'un apprenant et l'app
commence à générer de nouvelles questions, ce qui est justement le comportement qu'on veut montrer.
Une énorme banque de départ cacherait ce chemin au lieu de le faire tourner.

**L'anglais, le français et l'allemand sont déjà complets**, 90 questions chacun. La suite sert à
ajouter une quatrième langue, ou à remplacer une question qui s'est révélée fausse. Pour une
nouvelle langue, écris d'abord `grammar` et `vocabulary`, car ce sont des questions d'une seule
phrase, et `reading` ensuite, car chaque question demande aussi d'écrire un texte.

**L'écoute (listening) est hors du périmètre.** Elle demande de l'audio enregistré ou du TTS, du
stockage de fichiers, de la lecture audio et sa propre approche de l'accessibilité.

---

## 3. La forme d'une question

Un fichier par langue et par catégorie, dans `content/items/`, nommé d'après les deux valeurs
qu'il déclare : `de-grammar.json`, `fr-reading.json`. Les noms de champs sont les noms de colonnes
de `QuestionBank`, donc le seed copie chaque question telle quelle dans sa ligne, retrouvée par `sourceId`.

Chaque question a la même forme : une question, quatre choix, une seule bonne réponse et un temps
limite. `content/items/de-grammar.json` :

```jsonc
{
  "lang": "de",
  "category": "grammar",
  "items": [
    {
      "sourceId": "de-gram-0001",
      "level": "A1",
      "topic": "verbs_morphology",
      "question": "Wir ___ heute Abend zu Hause.",
      "options": ["bleiben", "bleibt", "bleibst", "bleibe"],
      "answer": "bleiben",
      "timeLimitS": 30
    }
  ]
}
```

La lecture (reading) est la seule catégorie différente, et la différence tient en un seul champ :
`readText`, le texte sur lequel porte la question. Elle a son propre fichier, donc une question de
lecture n'est jamais à côté d'une question de grammaire. `content/items/de-reading.json` :

```jsonc
{
  "lang": "de",
  "category": "reading",
  "items": [
    {
      "sourceId": "de-read-0001",
      "level": "A1",
      "topic": "information_structure_and_pragmatics",
      "readText": "Jonas wohnt in Leipzig. Er hat einen kleinen Hund, der Bruno heißt. Am Abend gehen die beiden zusammen im Park spazieren.",
      "question": "Wann gehen Jonas und Bruno spazieren?",
      "options": ["Am Abend", "Am Morgen", "Am Mittag", "Am Wochenende"],
      "answer": "Am Abend",
      "timeLimitS": 60
    }
  ]
}
```

| Champ        | Règle                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceId`   | `<language>-<gram\|voca\|read>-<4 digits>`, en accord avec le fichier où il se trouve. Unique dans tous les fichiers et **permanent** : le seed s'appuie dessus, donc le réutiliser écrase une autre question |
| `level`      | De `A1` à `C2`                                                                                                                                                                                                |
| `topic`      | Pris dans le §4. Évite qu'une case contienne cinq questions sur le même sujet                                                                                                                                 |
| `readText`   | Questions de lecture seulement, à omettre sinon                                                                                                                                                               |
| `question`   | Un texte à trous utilise `___`                                                                                                                                                                                |
| `options`    | Exactement 4, toutes différentes                                                                                                                                                                              |
| `answer`     | La bonne réponse en texte, qui doit apparaître mot pour mot dans `options`. Du texte et pas un index, pour que les choix puissent être mélangés à l'affichage                                                 |
| `timeLimitS` | Secondes pour répondre. Assez pour lire et réfléchir, trop peu pour aller chercher la réponse                                                                                                                 |

Les temps limites montent avec le niveau et avec la quantité de texte à lire. Ce qu'utilise la
banque de départ :

| Catégorie    | A1      | A2       | B1  | B2        | C1        | C2        |
| ------------ | ------- | -------- | --- | --------- | --------- | --------- |
| `vocabulary` | 30      | 45       | 45  | 45        | 60        | 60        |
| `grammar`    | 30      | 45       | 60  | 60        | 75        | 90        |
| `reading`    | 60 à 75 | 90 à 105 | 90  | 105 à 120 | 120 à 165 | 150 à 180 |

Pour la lecture, c'est une fourchette, car c'est la quantité de texte qui décide : le texte et les
quatre choix, puisque de longs choix demandent aussi du temps de lecture. Aligne-toi sur une
question voisine de même longueur au lieu de choisir un nombre, et compare les caractères plutôt
que les mots : les mots composés allemands font paraître un texte plus court qu'il ne se lit. Une
question générée prend son temps limite dans ce tableau, en haut de la fourchette pour la lecture,
jamais depuis le modèle.

Écris des mauvaises réponses crédibles. Un distracteur que personne ne choisirait rend la question
gratuite.

---

## 3b. Vérifier ton travail

Les fichiers sont validés par un test, donc tu as la réponse en quelques secondes au lieu
d'attendre la CI :

```bash
pnpm --filter @ft/api test src/items/item-files.spec.ts   # just the item files
make                                                      # everything, before the PR
```

Il échoue, avec l'id fautif et un message lisible, dans ces cas : une réponse qui n'est pas un des
choix, des choix qui ne sont pas exactement quatre ou pas tous différents, un `sourceId` au mauvais
format, réutilisé par un autre fichier, ou en désaccord avec la langue et la catégorie du fichier
où il se trouve, une question de lecture sans `readText` ou une autre question qui en a un, un
`level` ou un `topic` inconnu, un `timeLimitS` absent ou pas positif, et tout champ qui n'est pas
dans la liste ci-dessus.

Chaque fichier dans `content/items/` est un exemple qui marche de sa forme, dans trois langues.
Copie le plus proche et modifie-le.

## 4. Sujets (topics)

```
nouns_and_determiners      pronouns                  verbs_morphology
verb_usage                 syntax_and_sentence_structure
subordinate_clauses        prepositions_and_case     adjectives
adverbs                    agreement                 negation
comparison_and_quantity    information_structure_and_pragmatics
```

Les questions de vocabulaire et de lecture utilisent le sujet le plus proche, ou
`information_structure_and_pragmatics`. La même liste sert d'étiquette aux leçons de grammaire
(`Lesson.topic`), donc une question de grammaire et la leçon qui l'enseigne parlent la même langue.
Les autres types de leçons ont un `theme` à la place (voir [content/lessons.md](lessons.md)). Les
questions générées doivent aussi respecter la liste : le vocabulaire sous `VOCABULARY_TOPICS` dans
`packages/shared/src/schemas/item.ts` (les classes de mots, plus
`information_structure_and_pragmatics` pour les expressions toutes faites), la lecture toujours
sous `information_structure_and_pragmatics`.

---

## 5. La base de données

Deux tables. Les fichiers JSON sont la source de vérité dans git ; le script de seed les charge.

```prisma
model QuestionBank {
  id         String           @id @default(uuid()) @db.Uuid
  sourceId   String?          @unique
  lang       Language
  level      Level
  topic      Topic
  category   QuestionCategory
  readText   String?
  question   String
  options    String[]
  answer     String
  timeLimitS Int
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  userSeenQuestions UserSeenQuestion[]

  @@index([lang, level, category])
}

model UserSeenQuestion {
  id           String       @id @default(uuid()) @db.Uuid
  userId       String       @db.Uuid
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  questionId   String       @db.Uuid
  questionBank QuestionBank @relation(fields: [questionId], references: [id], onDelete: Cascade)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@unique([userId, questionId])
}
```

Deux ids, c'est voulu. `id` est la clé interne vers laquelle pointent toutes les autres tables,
donc rien ne casse quand une question est rechargée. `sourceId` est à toi : c'est par lui que le
seed trouve la ligne à mettre à jour, et modifier une question dans le fichier JSON change la ligne
au lieu d'en créer une deuxième. Une question écrite par le LLM pendant que l'app tourne n'a pas de
`sourceId` : c'est comme ça qu'on distingue les deux, et ça veut dire que personne ne l'a relue.

On ne pose jamais deux fois la même question à un apprenant : le tirage exclut toutes les questions
déjà liées à cet utilisateur par `UserSeenQuestion`. C'est par utilisateur et pas par test, donc
repasser le test ne peut pas non plus servir une ancienne question. La seule exception est une case
que le LLM n'a pas pu remplir à temps (§6), l'étape 3 de la cascade dans
[architecture/product.md](../architecture/product.md) §1.2. Le détail des tables est dans
[architecture/data-model.md](../architecture/data-model.md) §5 (Learning).

Il n'y a volontairement pas de score de difficulté, pas de compteurs servies/réussies et pas de
calibrage. Il faudrait des centaines de réponses par question pour qu'ils veuillent dire quelque
chose, et cette plateforme n'en verra jamais autant. Une colonne dont personne ne peut se servir
est pire que pas de colonne, car le prochain lecteur suppose qu'elle marche.

---

## 6. Quand la banque est vide

Un apprenant n'est jamais bloqué. Quand un tirage voit qu'il ne reste à un apprenant que 3
questions pas encore vues dans une case (langue, niveau, catégorie), l'API demande au LLM un lot
pour cette case en arrière-plan, et le tirage ne l'attend pas : 13 questions de grammaire, une par
sujet, 10 questions de vocabulaire, ou 5 questions de lecture, chacune sur son propre texte. Le lot
est vérifié avec `generatedBatchSchema`, les questions que la case a déjà sont retirées, et le reste
est enregistré sans `sourceId`, avec le niveau de la case et le temps limite du §3. Elles restent,
donc le prochain apprenant qui arrive à cette case les reçoit depuis la banque. **La banque grandit
avec l'usage**, c'est pourquoi 90 questions écrites à la main par langue suffisent.

Un lot est relancé une fois quand une relance peut aider (limite de débit, erreur serveur, réponse
qui ne respecte pas le schema), et une case dont le lot a échoué ou n'a rien ajouté est laissée de
côté pendant 10 minutes. Pendant ce temps, un apprenant qui n'a plus rien de nouveau reçoit la
question qu'il a vue il y a le plus longtemps. La cascade complète est dans
[architecture/product.md](../architecture/product.md) §1.2. Le code est dans
`apps/api/src/question-generation/`.

---

## 7. Relire les questions générées

Faire écrire un brouillon de lot par le LLM puis le relire est une bonne façon de remplir le seed,
et bien plus rapide que d'en écrire 90 à la main. Les livrer sans relecture, non : une question
fausse ne trompe pas un seul apprenant, elle donne un mauvais niveau à tous ceux qui la voient. Un
relecteur vérifie que la réponse est vraiment correcte, que les trois autres sont vraiment fausses,
que le niveau est crédible, et que la phrase sonne naturelle et pas traduite.

La section Resources du README doit indiquer que le LLM a écrit le brouillon et qui l'a vérifié. Le
sujet l'exige.

Pour voir ce que le modèle écrit pour un niveau, lance un vrai réapprovisionnement dans chaque
langue et lis ce qu'il a enregistré. Il écrit dans `DATABASE_URL` et, avec `gemini`, fait un appel
par case :

```bash
LLM_PROVIDER=gemini pnpm --filter @ft/api generation:try b1 vocabulary grammar
```
