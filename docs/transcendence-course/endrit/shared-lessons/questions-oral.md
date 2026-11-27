# Questions d'oral sur `packages/shared/src/lessons/`

> Retour au [README](README.md). Cache la réponse, réponds à voix haute, puis vérifie.
> Chaque réponse tient en 30 secondes.

---

**1. C'est quoi une leçon, techniquement ?**

Un ou deux fichiers JSON écrits à l'avance et commités : le **brief** (le plan, `content/briefs/<id>.json`) et le **contenu** (la leçon jouable, `content/lessons/<id>.json`). Le vocabulaire n'a que le brief : le code fabrique la leçon avec `vocabularyLesson()`. Rien n'est généré pendant que l'utilisateur joue.

**2. Pourquoi ce code est dans `packages/shared` et pas dans l'API ?**

Parce que plusieurs programmes doivent appliquer **les mêmes règles** : le seed, le kit d'auteur (`lessons:author`, `lessons:check`), les tests de l'API, et le front (pour `parseRichText`). Une seule source de vérité : si le kit accepte une leçon, le seed l'accepte aussi.

**3. Pourquoi Zod ?**

TypeScript ne vérifie qu'à la compilation. Un JSON lu sur le disque est `unknown`. Zod vérifie **à l'exécution** et donne en plus le type TypeScript (`z.infer`). Un seul endroit décrit la forme, et le type suit.

**4. Quelle différence entre un schéma et un validateur, ici ?**

Le schéma (`schemas/`) vérifie la **forme** : champs présents, types, longueurs, pas de champ inconnu. Le validateur (`validation/`) vérifie le **sens** : les ids pointent vers quelque chose qui existe, le contenu suit le brief, les durées sont justes. On fait le schéma d'abord ; s'il échoue, on s'arrête.

**5. Pourquoi pas de `refine` / `superRefine` dans les schémas ?**

Choix volontaire : les schémas ne décrivent que la forme. Les règles qui comparent des champs sont dans `validation/`, écrites en TypeScript simple, avec la classe `Issues`. Avantages : schémas lisibles, vérifications qui peuvent supposer une forme correcte, et **tous** les problèmes collectés avec des messages clairs.

**6. À quoi sert `strictObject` ?**

Il refuse les champs inconnus. Une faute de frappe dans un nom de champ (`anwserExplanation`) est détectée au lieu d'être ignorée. Ça refuse aussi un vieux champ comme `nativeLanguage` (testé).

**7. Pourquoi les schémas sont des fonctions de `lang` ?**

Les traductions vont dans toutes les langues **sauf** celle du cours : `{ en, de }` pour le français, `{ en, fr }` pour l'allemand, `{ fr, de }` pour l'anglais. Les clés changent, donc on construit le schéma pour une langue (`nativeLocales(lang)`).

**8. Que renvoie `validateLesson` ? Dans quel ordre sont les problèmes ?**

`{ ok: true, brief, content, title, summary }` ou `{ ok: false, issues }`. Chaque problème a un chemin préfixé par `brief.` ou `content.`. Le brief d'abord. Si le brief est invalide, on ne renvoie **que** ses problèmes : sans brief valide, on ne peut pas vérifier le contenu contre lui.

**9. Pourquoi collecter tous les problèmes au lieu de lancer une exception ?**

Pour que l'auteur corrige tout en une passe. Dans le kit d'auteur, la liste entière est renvoyée au modèle, qui corrige et renvoie un brouillon. Une exception ne donnerait que le premier problème : beaucoup plus d'allers-retours.

**10. Pourquoi `validateLesson` renvoie les fichiers parsés, et pas juste `ok` ?**

Parce que Zod **transforme** : `trim()` enlève les espaces au bord des textes. Le seed stocke donc la version parsée, propre. Test : `"  Lire un SMS  "` devient `"Lire un SMS"`. Elle renvoie aussi `title` et `summary`, les colonnes de la table `Lesson`.

**11. Qu'est-ce que `validateLesson` vérifie en plus de `validateBrief` et `validateContent` ?**

Quatre choses : (1) le fichier contenu existe (sauf vocabulaire) ; (2) les règles de longueur de la grammaire (`grammarLength.ts`) ; (3) le titre ≤ 80 caractères et l'objectif dans la langue du cours ≤ 200, sur une ligne (ce que la base et la carte de leçon acceptent) ; (4) le contenu répète le titre et l'objectif du brief mot pour mot.

**12. Pourquoi les règles de longueur de grammaire sont à part ?**

Une leçon courte reste **correcte** ; elle est juste trop courte pour être publiée. `validateBrief` et `validateContent` disent « correct ou non » ; `validateLesson` dit « publiable ou non ». Les tests ont des fixtures courtes qui passent les deux validateurs mais pas `validateLesson`.

**13. Comment garantis-tu que `estimatedMinutes` et les durées sont justes ?**

Elles ne sont pas choisies : elles sont **calculées** par `domain/` (`functionsPageEstimate`, `readingPageEstimate`, `vocabularyLesson`…). Le validateur recalcule et compare à la seconde près. Le kit d'auteur utilise les mêmes fonctions (`apps/api/scripts/lessons/times.ts`) pour écrire les durées. `estimatedMinutes` = somme des pages ÷ 60, arrondie, au moins 1 (`checkMinutes`).

**14. Qu'as-tu changé pour l'allemand et l'anglais (PR #162) ?**

Les règles qui étaient « françaises » dépendent maintenant de la langue, surtout via `domain/articles.ts` :
- genre : fr masculin/féminin, de + neutre, en aucun ;
- article d'enseignement : fr `un/une/des`, de `der/die/das`, en aucun (et `articleException` interdit) ;
- articles interdits au début d'une réponse : en allemand toutes les formes déclinées (`den`, `dem`, `eines`…) ;
- le tableau `person_matching` n'est obligatoire en anglais que pour `pronouns`, et 2sg/2pl peuvent être identiques (`you are`) ;
- impératifs allemands exemptés ; consigne d'examen qui nomme la langue du cours.

**15. Qu'est-ce que `parseRichText` et pourquoi un Markdown si limité ?**

Elle découpe un texte en blocs (paragraphes, listes) et morceaux (texte, gras, forme entre backticks), et renvoie les erreurs au lieu de planter. Limité pour trois raisons : affichage par notre propre composant React sans HTML injecté ; moins de surprises pour l'auteur ; et on peut **comparer** les versions en/fr/de (même squelette `p|ul:6`, mêmes formes entre backticks).

**16. Que veut dire le statut `stale` ?**

Le fichier est valide, mais il a été écrit à partir d'une ancienne version de son entrée d'outline ou de son brief (les empreintes SHA-256 de `provenance.inputHashes` ne correspondent plus). `validateLesson` ne bloque pas sur `stale` : seul `invalid` bloque. Le seed ne passe d'ailleurs pas d'empreinte.

**17. Comment éviter qu'un examen répète l'entraînement ?**

Grammaire : `checkFreshExam` remplit chaque phrase avec sa réponse, la normalise (minuscules, sans ponctuation) et vérifie qu'aucune phrase d'examen n'a été vue avant. Fonctions : `practiceSentences` rassemble toutes les phrases déjà vues (exemples, dialogue, exercices). Lecture : aucune question répétée, aucun paragraphe recopié du document principal.

**18. Pourquoi le vocabulaire n'a pas de fichier contenu ?**

La leçon suit **toujours la même recette** (introduction, cartes, association, genre, trous, écoute, examen). Le brief contient tous les textes d'exercice de chaque mot. Écrire un fichier contenu serait redondant et pourrait contredire le brief. `validateContent` refuse même un fichier contenu pour le vocabulaire.

---

## Pièges à éviter à l'oral

- Ne dis pas « Zod vérifie tout » : Zod vérifie la **forme** ; le sens est dans `validation/`.
- Ne dis pas « le validateur s'arrête à la première erreur » : il collecte **tout** (sauf quand le schéma casse, ou quand la structure est trop cassée pour continuer : nombre d'étapes faux en grammaire, stades faux en fonctions, documents/étapes faux en lecture).
- Ne confonds pas `NestedIdSchema` (id interne, chiffres permis, 48 max) et `LessonIdSchema` (id de leçon, `<lang>-<mots>`, sans chiffres, 64 max).
- Le dossier `player/` (lecteur, score) n'est pas le validateur : ici, **rien ne calcule de score**.
