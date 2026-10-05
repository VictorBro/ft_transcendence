# `question-generation/` expliqué en entier

Dossier : `apps/api/src/question-generation/`

Ce document explique **tout** le module : son rôle, chaque fichier, le trajet complet d'un restock, puis ce qui a changé depuis la PR #69.
Prérequis : avoir compris le dossier `llm/` (voir `../llm/GEMINI_PROVIDER.md` et `llm.provider.ts`).

---

## 0. En une phrase

Quand un apprenant n'a presque plus de questions non vues dans une **cellule** (une langue + un niveau + une catégorie), ce module demande au LLM un nouveau lot de questions, retire les doublons, et les enregistre dans la table `QuestionBank`.

Il **remplit** la banque. Il ne **choisit pas** quelle question montrer : ça, c'est le travail de `PlacementQuestionService`, dans `placement/`.

---

## 1. Les fichiers et l'ordre de lecture

```
question-generation/
├── question-generation.module.ts   ← le module NestJS (le câblage)
├── question-batch.ts                ← fonctions pures : Cell, doublons, lignes à insérer
├── prompts/
│   └── question-batch.prompt.ts     ← construit le texte envoyé au LLM
├── question-stock.service.ts        ← le cœur : quand et comment réapprovisionner
├── question-batch.spec.ts           ← tests de question-batch.ts
├── prompts/question-batch.prompt.spec.ts
└── question-stock.service.spec.ts   ← tests du service
```

Ordre conseillé : **module → question-batch → prompt → stock service**. On va du plus simple (pas de dépendance) au plus riche (qui utilise tout le reste).

Ce que chaque fichier utilise :

```
question-stock.service.ts
   ├── llm/llm.provider.ts            (LLM_PROVIDER, LlmProvider, LlmError)
   ├── prisma/prisma.service.ts       (la base de données)
   ├── @ft/shared                     (generatedBatchSchema, GeneratedItem)
   ├── prompts/question-batch.prompt.ts
   │      └── @ft/shared              (TOPICS, LEVELS, tailles de lot...)
   └── question-batch.ts
          └── @ft/shared, Prisma      (types seulement)
```

---

## 2. Les notions de base

### 2.1 La table `QuestionBank`

Extrait de `apps/api/prisma/schema.prisma` :

```prisma
model QuestionBank {
  id         String           @id @default(uuid())
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
  ...
  @@index([lang, level, category])
}
```

Deux sortes de lignes y cohabitent :

| Sorte                  | `sourceId`             | D'où elle vient                                                           |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------- |
| **Écrite** à la main   | `"fr-gram-0001"`, etc. | fichiers `content/items/*.json`, chargés par le seed, relue par un humain |
| **Générée** par le LLM | `null`                 | ce module, **jamais relue**                                               |

C'est ce `null` qui permet au placement de servir les questions écrites en priorité.

### 2.2 La cellule (`Cell`)

```ts
export type Cell = { lang: Language; level: Level; category: QuestionCategory };
```

Une cellule, c'est par exemple `{ lang: 'fr', level: 'B1', category: 'grammar' }`. C'est :

- la **tranche** de la banque où le placement pioche une question ;
- l'**unité** de réapprovisionnement : on génère toujours un lot pour **une** cellule.

Il y a l'index `@@index([lang, level, category])` dans la table justement parce qu'on cherche toujours par cellule.

En texte, une cellule devient une **clé** : `"fr:B1:grammar"`. Cette clé sert dans les `Map` du service et dans les logs.

### 2.3 Les catégories et la taille des lots

Tout vient de `packages/shared/src/schemas/item.ts` :

| Catégorie    | Questions par lot                | Topic                      | Particularité                                   |
| ------------ | -------------------------------- | -------------------------- | ----------------------------------------------- |
| `grammar`    | 13, **une par topic** (`TOPICS`) | un des 13 `TOPICS`         | phrase avec un trou `___`                       |
| `vocabulary` | `VOCABULARY_BATCH_SIZE` = 10     | un des `VOCABULARY_TOPICS` | phrase avec un trou `___`                       |
| `reading`    | `READING_BATCH_SIZE` = 5         | toujours `READING_TOPIC`   | chaque question a son propre passage `readText` |

Chaque question a `OPTIONS_PER_ITEM` = 4 options, et `answer` est l'une d'elles, mot pour mot.

Le lot de lecture est petit parce que chaque question porte un passage de 25 à 100 mots : 5 passages font déjà une longue réponse.

### 2.4 `GeneratedItem` et `generatedBatchSchema`

Aussi dans `@ft/shared` :

```ts
export type GeneratedItem = Omit<Item, "sourceId" | "level" | "timeLimitS">;
export type GeneratedBatch = { items: GeneratedItem[] };
```

- `Item` est une question écrite complète.
- `Omit<Item, 'a' | 'b'>` est un type utilitaire : « le type `Item`, **sans** les champs `a` et `b` ».
- Une question générée n'a donc ni `sourceId`, ni `level`, ni `timeLimitS` : c'est le **serveur** qui les met, jamais le modèle.

Ce qui reste : `topic`, `question`, `options`, `answer`, et `readText` (optionnel, seulement en lecture).

`generatedBatchSchema(category)` renvoie le schéma Zod d'un lot pour une catégorie. Il vérifie :

- le bon nombre de questions (`.length(...)`) ;
- 4 options non vides par question ;
- `answer` présent dans `options`, options toutes différentes (via `.refine`) ;
- grammaire : exactement une question par topic ;
- lecture : un passage `readText` par question, tous différents.

Ce schéma voyage avec la requête jusqu'au provider, qui valide la réponse (voir `GEMINI_PROVIDER.md`, sections 7 et 10). Quand `generateStructured` renvoie, les données ont **déjà** été vérifiées.

---

## 3. `question-generation.module.ts`

```ts
@Module({
  imports: [LlmModule],
  providers: [QuestionStockService],
  exports: [QuestionStockService],
})
export class QuestionGenerationModule {}
```

| Clé                                 | Sens                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `imports: [LlmModule]`              | On a besoin du LLM. `LlmModule` exporte le jeton `LLM_PROVIDER`, donc ce module peut l'injecter. |
| `providers: [QuestionStockService]` | Les classes que Nest construit pour ce module.                                                   |
| `exports: [QuestionStockService]`   | Les classes que les **autres** modules peuvent utiliser s'ils importent celui-ci.                |

Qui l'importe ? `placement/placement.module.ts` :

```ts
imports: [CoursesModule, QuestionGenerationModule],
```

C'est ce qui permet à `PlacementQuestionService` de recevoir `QuestionStockService` dans son constructeur.

`PrismaService` n'est pas importé ici. Il vient d'un module global (`PrismaModule`), disponible partout sans import.

Ici, pas besoin de jeton : `QuestionStockService` est une **classe concrète**, avec une seule implémentation. Nest l'identifie directement par sa classe (voir la règle « classe concrète → la classe, interface → un jeton »).

---

## 4. `question-batch.ts` : les fonctions pures

« Pure » veut dire : pas de base de données, pas de LLM, pas de Nest. Des données entrent, des données sortent. On les teste donc sans rien simuler (`question-batch.spec.ts`).

### 4.1 Les types

```ts
export type Cell = { lang: Language; level: Level; category: QuestionCategory };
type Stored = { question: string; readText: string | null };
```

- `Cell` : voir 2.2. Les noms des champs sont **les mêmes** que les colonnes de `QuestionBank`. Conséquence pratique : on peut écrire `where: cell` dans une requête Prisma, sans rien réécrire.
- `Stored` : ce qu'on relit de la base pour chercher les doublons, seulement deux colonnes. `readText` est `string | null` parce que la base stocke un passage absent comme `NULL`. (Côté généré, un passage absent est `undefined`. Les deux sont gérés plus bas.)
- `Stored` n'est pas exporté : il ne sert qu'à ce fichier.

### 4.2 `TIME_LIMIT_S` : le temps par question

```ts
const TIME_LIMIT_S: Record<QuestionCategory, Record<Level, number>> = {
  vocabulary: { A1: 30, A2: 45, B1: 45, B2: 45, C1: 60, C2: 60 },
  grammar: { A1: 30, A2: 45, B1: 60, B2: 60, C1: 75, C2: 90 },
  reading: { A1: 75, A2: 105, B1: 90, B2: 120, C1: 165, C2: 180 },
};
```

- `Record<K, V>` (déjà vu dans la factory) : un objet avec **toutes** les clés `K`, chacune contenant un `V`.
- Ici c'est imbriqué : pour chaque catégorie, un objet qui donne un nombre pour chaque niveau.
- L'avantage : si on oublie un niveau ou une catégorie, **ça ne compile pas**. TypeScript exige les 3 × 6 cases.
- Les valeurs viennent du tableau de `docs/ITEM_BANK.md`, en prenant le **haut** de chaque fourchette, car un passage généré peut être long.

Avant (#69), c'était le **modèle** qui donnait `timeLimitS` dans sa réponse. Maintenant le modèle ne le donne plus, et c'est ce tableau qui décide. Un modèle n'a aucune raison d'être bon pour choisir un chrono.

### 4.3 `normalise` et `itemKey` : comment on reconnaît un doublon

```ts
const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

const itemKey = ({ question, readText }: GeneratedItem | Stored) =>
  [readText ?? "", question].map(normalise).join("\n");
```

**`normalise`** rend deux textes comparables :

| Étape                   | Effet                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| `.trim()`               | enlève les espaces au début et à la fin                                         |
| `.toLowerCase()`        | tout en minuscules                                                              |
| `.replace(/\s+/g, ' ')` | chaque suite d'espaces, tabulations ou retours à la ligne devient **un** espace |

La regex `/\s+/g` : `\s` = un caractère d'espacement, `+` = un ou plusieurs, `g` = partout dans le texte (pas seulement la première fois).

Exemple : `"  Je  mange ___ pomme. "` et `"je mange ___ pomme."` donnent tous les deux `"je mange ___ pomme."`.

**`itemKey`** fabrique l'« identité » d'une question : passage + question, normalisés, séparés par un retour à la ligne.

- Le paramètre accepte `GeneratedItem | Stored` : une question générée **ou** une ligne de la base. Les deux ont `question` et `readText`, donc la même fonction sert aux deux côtés.
- `readText ?? ''` : un passage vide quand il n'y en a pas. Le `??` couvre à la fois `undefined` (côté généré) et `null` (côté base).
- **Pourquoi le passage fait partie de la clé ?** En lecture, la question « Quelle est l'idée principale ? » peut légitimement revenir sur **chaque** texte. Sans le passage dans la clé, la deuxième serait vue comme un doublon et jetée à tort.

Exemple de clé pour une question de lecture :

```
"marie habite à lyon depuis deux ans. elle travaille dans une boulangerie...\noù travaille marie ?"
```

### 4.4 `freshItems` : retirer les doublons

```ts
export function freshItems(items: readonly GeneratedItem[], stored: readonly Stored[]) {
  const seen = new Set(stored.map(itemKey));
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

Elle garde les questions qui ne sont **ni déjà dans la cellule, ni répétées plus tôt dans le même lot**.

1. `seen` démarre avec les clés de toutes les questions déjà en base. Un `Set` est une collection sans doublons, avec une recherche rapide (`has`). C'est l'équivalent de `std::unordered_set`.
2. `items.filter(...)` garde les éléments pour lesquels la fonction renvoie `true`. Pour chaque question :
   - clé déjà vue → `false`, on la jette ;
   - sinon → on **ajoute** sa clé à `seen` et on la garde (`true`).

L'ajout à `seen` est ce qui attrape aussi les doublons **à l'intérieur** du lot : si le modèle écrit deux fois la même question, la deuxième trouve la clé de la première.

`readonly` devant les tableaux : la fonction promet de ne pas les modifier (pas de `push`, pas de `sort` sur place). Le compilateur le vérifie.

Exemple :

```
en base :      ["Je ___ français.", "Il ___ grand."]
lot généré :   ["Je ___ français.", "Nous ___ amis.", "nous  ___ amis."]
résultat :     ["Nous ___ amis."]
               (1re : déjà en base ; 3e : même clé que la 2e après normalise)
```

### 4.5 `toRows` : préparer les lignes à insérer

```ts
export function toRows(
  cell: Cell,
  items: readonly GeneratedItem[],
): Prisma.QuestionBankCreateManyInput[] {
  const timeLimitS = TIME_LIMIT_S[cell.category][cell.level];
  return items.map((item) => ({ ...item, ...cell, sourceId: null, timeLimitS }));
}
```

- `Prisma.QuestionBankCreateManyInput` : le type d'**une ligne** à insérer, généré automatiquement par Prisma à partir de `schema.prisma`. Si un champ obligatoire manque, ça ne compile pas.
- `TIME_LIMIT_S[cell.category][cell.level]` : le chrono pour cette cellule, calculé une seule fois.
- `items.map(...)` transforme chaque question en ligne. L'objet est construit avec le **spread** `...` :

```ts
{ ...item, ...cell, sourceId: null, timeLimitS }
// équivaut à :
{
  topic: item.topic, question: item.question, options: item.options,
  answer: item.answer, readText: item.readText,      // ← de item
  lang: cell.lang, level: cell.level, category: cell.category,  // ← de cell
  sourceId: null,                                    // ← « générée, pas relue »
  timeLimitS: timeLimitS,                            // ← raccourci : même nom que la variable
}
```

Points importants :

- **Le niveau vient de la cellule, jamais du modèle.** Si on demande du B1, la question est rangée en B1, même si le modèle a « dérivé ».
- `sourceId: null` marque la ligne comme générée.
- Pour la grammaire et le vocabulaire, `readText` est `undefined` : Prisma ignore un champ `undefined`, donc la colonne reste `NULL`.
- `{ timeLimitS }` est le raccourci de `{ timeLimitS: timeLimitS }` (_shorthand property_).

---

## 5. `prompts/question-batch.prompt.ts` : le texte envoyé au LLM

Ce fichier **ne fait que construire du texte**. Il n'appelle ni le LLM ni la base.

Il exporte une seule fonction :

```ts
export function buildQuestionBatchPrompt(cell: Cell): { system: string; user: string };
```

Elle renvoie les deux messages de la requête. Le **format JSON** n'est pas dans le prompt : il part séparément, sous forme de schéma (`responseJsonSchema`, voir `GEMINI_PROVIDER.md` section 7). Le prompt ne porte que les **règles de contenu** : quoi écrire, à quel niveau, comment.

### 5.1 `CEFR_LEVEL_REFERENCE` : la grande référence commune

Une longue chaîne entre backticks (un _template string_, qui peut tenir sur plusieurs lignes). C'est le **même texte** pour toutes les langues et tous les niveaux. Il contient :

| Partie                       | Contenu                                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro                        | Le CECR décrit une capacité globale ; il faut la traduire en difficulté linguistique observable. Les exemples sont en anglais et doivent être **adaptés**, jamais copiés ni traduits. La longueur des passages est fixe : la difficulté vient de la densité, pas de la longueur. |
| A1 → C2                      | Pour chaque niveau : capacité globale, vocabulaire, grammaire, syntaxe, lecture, **cibles de question** (avec « trop facile » / « trop difficile ») et exemples.                                                                                                                 |
| FUNDAMENTAL CALIBRATION RULE | Un niveau ne se juge pas au vocabulaire seul, mais à la combinaison de 10 critères (grammaire, syntaxe, inférence, registre...).                                                                                                                                                 |
| DISTRACTOR QUALITY           | Comment écrire les **mauvaises options** (les distracteurs) : plausibles, naturelles, mais clairement fausses. Exemples d'erreurs typiques par niveau.                                                                                                                           |
| ANTI-PATTERNS                | Ce qu'il ne faut pas faire : un B2 qui n'est qu'un A2 avec un mot rare, un C1/C2 fondé seulement sur des mots rares, de la culture générale au lieu de la langue, des pièges ambigus...                                                                                          |

L'objectif est que les questions soient **au bon niveau**. C'est le point faible classique des questions générées : un modèle a tendance à confondre « difficile » et « mot rare ».

### 5.2 `categoryBrief` : ce qui change selon la catégorie

```ts
function categoryBrief({ lang, level, category }: Cell) {
  switch (category) {
    case 'grammar':    return { count, rules, calibration, user };
    case 'vocabulary': return { ... };
    case 'reading':    return { ... };
  }
}
```

Le paramètre est déstructuré directement : la cellule devient trois variables.

Elle renvoie quatre morceaux :

| Morceau       | Rôle                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `count`       | Combien de questions écrire.                                                      |
| `rules`       | Règles en plus, ajoutées à la liste `RULES` du message système.                   |
| `calibration` | Comment juger la difficulté pour cette catégorie, ajouté après la référence CECR. |
| `user`        | La demande courte, envoyée comme message `user`.                                  |

Par catégorie :

**grammar**

- `count` = `TOPICS.length` (13).
- Règles : une phrase avec un seul trou `___` ; **exactement une question par topic**, sans répétition ni oubli. La liste des topics est insérée dans le texte avec `TOPICS.join(', ')`.
- Calibration : chaque topic doit être testé à la profondeur du niveau. Exemple donné : `subordinate_clauses` en A1/A2, c'est un simple « because » ; en C1/C2, ce sont des enchâssements multiples.
- `user` : `Write 13 B1 grammar questions in "fr", one per topic.`

**vocabulary**

- `count` = `VOCABULARY_BATCH_SIZE` (10).
- Règles : un trou `___` ; tester le **vocabulaire**, pas la grammaire (collocations, choix entre sens proches, formation des mots, expressions figées) ; pas d'options qui ne diffèrent que par la conjugaison ou l'accord, sinon c'est une question de grammaire ; `topic` = le plus proche parmi `VOCABULARY_TOPICS`.
- Calibration : le mot testé doit correspondre à la ligne « Vocabulary » du niveau dans la référence CECR.
- `user` : `Write 10 B1 vocabulary questions in "fr".`

**reading**

- `count` = `READING_BATCH_SIZE` (5).
- Règles : chaque question a **son propre** passage `readText` de 25 à 100 mots, jamais réutilisé ; `topic` est toujours `READING_TOPIC`.
- Calibration : calibrer le passage et la question **séparément**. A1/A2 : trouver une info explicite. B1/B2 : relier plusieurs infos, idée principale. C1/C2 : inférence, attitude de l'auteur, nuances. La réponse doit venir du **passage seul**, jamais de la culture générale.
- `user` : `Write 5 B1 reading comprehension questions in "fr", each with its own passage.`

**Prompt et schéma restent d'accord.** Le prompt **demande** 13, 10 ou 5 questions, et `generatedBatchSchema` **vérifie** ces nombres. Les deux lisent les **mêmes constantes** de `@ft/shared`, donc ils ne peuvent pas diverger. Si on change `VOCABULARY_BATCH_SIZE`, le prompt et la validation changent ensemble.

### 5.3 `buildQuestionBatchPrompt` : l'assemblage

```ts
const index = LEVELS.indexOf(level);
const lower: Level | undefined = LEVELS[index - 1];
const upper: Level | undefined = LEVELS[index + 1];
```

On cherche le niveau juste en dessous et juste au-dessus. Pour `B1` (index 2), ça donne `A2` et `B2`. Pour `A1`, `LEVELS[-1]` vaut `undefined` (pas de niveau en dessous) ; pour `C2`, `LEVELS[6]` vaut `undefined`. D'où le type `Level | undefined`, écrit explicitement.

Le message système est assemblé dans cet ordre :

```
You are an expert CEFR language exam designer.
Write <count> multiple-choice placement questions for category "<category>", in language "<lang>", at CEFR level <level>.

RULES
<rules de la catégorie>
- 4 options différentes, "answer" recopie la bonne mot pour mot ; une seule est correcte.
- Tout est dans la langue cible.
- Calibrer avec la référence CECR. [Plus dur que <lower>.] [Rien qui demande <upper> ou plus.]
- Pas deux questions identiques dans le lot.

<CEFR_LEVEL_REFERENCE>

<calibration de la catégorie>

INTERNAL CALIBRATION CHECK
1. à 8. : questions que le modèle doit se poser avant chaque question
   (quelle compétence ? bon niveau ? trop facile ? trop dur ? distracteurs adaptés ?...)
Revise the item if any answer is unsatisfactory. Never put this check or your reasoning in the reply.
```

Les phrases entre crochets sont conditionnelles :

```ts
${lower ? ` Each item must be clearly harder than typical ${lower} material.` : ''}
```

C'est un ternaire **dans** un template string : si `lower` existe, on insère la phrase, sinon une chaîne vide. Donc pas de « plus dur que ... » en A1, et pas de « rien au-dessus de ... » en C2.

La dernière phrase (« Never put this check or your reasoning in the reply ») évite que le modèle écrive sa réflexion dans le JSON, ce qui le casserait.

Le message `user` est la phrase courte de `categoryBrief`.

---

## 6. `question-stock.service.ts` : le cœur

### 6.1 Les constantes

```ts
const RESTOCK_AT = 3;
const COOLDOWN_MS = 10 * 60_000;
```

- `RESTOCK_AT` : un apprenant à **3 questions non vues ou moins** dans une cellule déclenche un restock. On n'attend pas zéro : le LLM met plusieurs secondes, et pendant ce temps l'apprenant continue de piocher dans les 3 restantes.
- `COOLDOWN_MS` : 10 minutes (10 × 60 000 ms). Après un échec, ou un lot où rien n'était nouveau, la cellule est laissée tranquille pendant cette durée.

### 6.2 `RestockOutcome` : ce que `restock` renvoie

```ts
export type RestockOutcome = {
  status: "stocked" | "busy" | "cooling" | "filled" | "failed";
  inserted: number;
};
```

`status` est une **union de littéraux** : une seule de ces cinq chaînes.

| Status    | Sens                                                                       | `inserted`                     |
| --------- | -------------------------------------------------------------------------- | ------------------------------ |
| `stocked` | Il reste assez de questions, rien à faire.                                 | 0                              |
| `busy`    | Un restock de cette cellule tourne déjà.                                   | 0                              |
| `cooling` | La cellule est en pause (échec ou rien de nouveau il y a moins de 10 min). | 0                              |
| `filled`  | On a appelé le LLM et enregistré les nouvelles questions.                  | le nombre inséré (peut être 0) |
| `failed`  | Le LLM ou la base a échoué ; c'est loggé, et la cellule part en pause.     | 0                              |

Le placement **ignore** cette valeur (`void this.stock.restock(...)`). Elle sert aux **tests**, qui vérifient chaque cas, et à la lecture du code.

### 6.3 La classe et son état

```ts
@Injectable()
export class QuestionStockService {
  private readonly logger = new Logger(QuestionStockService.name);
  private readonly inFlight = new Map<string, Promise<RestockOutcome>>();
  private readonly coolingUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}
```

- `@Injectable()` : Nest construit cette classe et lui donne ses dépendances.
- **Singleton** : Nest crée **une seule** instance pour toute l'API. Les deux `Map` sont donc **partagées par tous les apprenants**. C'est ce qui permet à un deuxième apprenant de voir qu'un restock tourne déjà pour la même cellule.
- `Map<K, V>` : un dictionnaire clé → valeur (comme `std::unordered_map`). La clé est la cellule en texte, `"fr:B1:grammar"`.
  - `inFlight` : les restocks **en cours**, cellule → sa `Promise`.
  - `coolingUntil` : cellule → l'heure (en ms, comme `Date.now()`) **avant laquelle** on ne touche pas à la cellule.
- **En mémoire, donc par processus.** Si on lançait plusieurs serveurs API, chacun aurait ses propres `Map` et pourrait lancer le même restock. Il n'y a qu'une instance API pour l'instant (issue #44), donc ça suffit. Sinon, il faudrait un verrou partagé (Redis, ou la base).
- Le constructeur reçoit :
  - `PrismaService` **par sa classe** : une seule implémentation, pas besoin de jeton ;
  - le LLM **par son jeton**, avec `@Inject(LLM_PROVIDER)`, parce que `LlmProvider` est une interface (elle disparaît à la compilation).

### 6.4 `restock` : la porte d'entrée

```ts
async restock(cell: Cell, unseen: number): Promise<RestockOutcome> {
  if (unseen > RESTOCK_AT) return { status: 'stocked', inserted: 0 };

  const key = `${cell.lang}:${cell.level}:${cell.category}`;
  if (this.inFlight.has(key)) return { status: 'busy', inserted: 0 };
  if (Date.now() < (this.coolingUntil.get(key) ?? 0)) return { status: 'cooling', inserted: 0 };

  const job = this.fill(cell, key).finally(() => this.inFlight.delete(key));
  this.inFlight.set(key, job);
  return job;
}
```

`unseen` : combien de questions de cette cellule l'apprenant n'a **pas encore vues**.

Trois vérifications, dans cet ordre. Chacune peut arrêter ici :

1. **Assez de questions ?** Plus de 3 → `stocked`. C'est le cas le plus fréquent, et il ne coûte rien : pas de clé à calculer, pas de `Map` à lire.
2. **Déjà en cours ?** → `busy`. Sans ça, 10 apprenants sur la même cellule lanceraient 10 appels au LLM.
3. **En pause ?** → `cooling`. `this.coolingUntil.get(key) ?? 0` : une cellule qui n'a jamais échoué n'a pas d'entrée, donc `get` renvoie `undefined`, remplacé par `0` (le 1er janvier 1970). `Date.now()` est toujours plus grand, donc pas de pause.

Sinon, on lance le travail :

- `this.fill(cell, key)` **sans `await`** : on récupère la `Promise` sans attendre.
- `.finally(...)` : s'exécute à la fin, **succès ou échec**, et retire la cellule de `inFlight`. Sans ça, la cellule resterait `busy` pour toujours et ne serait plus jamais réapprovisionnée.
- `this.inFlight.set(key, job)` : on enregistre la promesse pour que les appels suivants voient `busy`.
- `return job` : l'appelant peut attendre le résultat s'il veut (les tests le font), ou l'ignorer (le placement le fait).

**Pourquoi le test `busy` est fiable.** JavaScript n'exécute qu'**une chose à la fois** (un seul thread, la _boucle d'événements_). Une fonction ne peut être interrompue par une autre requête **qu'à un `await`**. Entre `this.inFlight.has(key)` et `this.inFlight.set(key, job)`, il n'y a aucun `await`. Aucune autre requête ne peut donc passer entre les deux et lancer le même restock. En C++ multi-thread, il faudrait un mutex ; ici, pas besoin.

(`fill` démarre bien au moment de l'appel, et tourne jusqu'à son premier `await` interne, l'appel réseau. Mais ce bout est synchrone lui aussi, donc l'argument tient.)

### 6.5 `fill` : générer, dédoublonner, enregistrer

```ts
private async fill(cell: Cell, key: string): Promise<RestockOutcome> {
  try {
    const items = await this.generate(cell, key);
    const stored = await this.prisma.questionBank.findMany({
      where: cell,
      select: { question: true, readText: true },
    });
    const { count } = await this.prisma.questionBank.createMany({
      data: toRows(cell, freshItems(items, stored)),
    });
    this.logger.log(`restocked ${key}: ${count} of ${items.length} questions were new`);
    if (count === 0) this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
    return { status: 'filled', inserted: count };
  } catch (error) {
    this.logger.warn(`restock ${key} failed: ${String(error)}`);
    this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
    return { status: 'failed', inserted: 0 };
  }
}
```

Étape par étape :

1. **Générer.** `this.generate(cell, key)` renvoie les questions, déjà validées par le schéma (voir 6.6).
2. **Relire l'existant.** `findMany` avec `where: cell` (possible car les noms de champs correspondent aux colonnes) et `select` pour ne lire que deux colonnes. Inutile de charger les options et réponses de toute la cellule.
3. **Garder le neuf et enregistrer.** `freshItems(items, stored)` retire les doublons, `toRows(cell, ...)` prépare les lignes, `createMany` les insère **en une seule requête SQL**. Prisma renvoie `{ count }`, le nombre de lignes insérées. On le récupère par déstructuration.
4. **Log**, par exemple : `restocked fr:B1:grammar: 11 of 13 questions were new`.
5. **Rien de nouveau ?** Si `count === 0`, le modèle ne fait que réécrire des questions qu'on a déjà. Le rappeler tout de suite coûterait de l'argent pour rien, donc la cellule part en pause. C'est tout de même un `filled` : l'appel a marché.

**Le `try/catch` qui entoure tout.** N'importe quelle erreur (LLM, base de données...) devient `{ status: 'failed' }`, et la cellule part en pause 10 minutes. C'est ce qui permet à `restock` de promettre qu'il **ne rejette jamais**. Ça compte, parce que le placement ne l'attend pas : une `Promise` qui rejette sans que personne ne l'écoute devient une _unhandled rejection_, qui peut **faire planter tout le processus Node**.

`String(error)` : `error` dans un `catch` est de type `unknown` (ça peut être n'importe quoi). `String(...)` le transforme en texte sans risque.

**Pourquoi une pause après un échec ?** Sans elle, un LLM en panne, ou le `FixtureProvider` qui échoue toujours, serait rappelé **à chaque question piochée** par chaque apprenant. Avec, c'est au plus une tentative par cellule toutes les 10 minutes.

### 6.6 `generate` : l'appel au LLM, avec un éventuel deuxième essai

```ts
private async generate(cell: Cell, key: string): Promise<GeneratedItem[]> {
  const request = {
    purpose: `question-batch:${cell.category}`,
    schema: generatedBatchSchema(cell.category),
    ...buildQuestionBatchPrompt(cell),
  } as const;
  try {
    return (await this.llm.generateStructured(request)).items;
  } catch (error) {
    if (!(error instanceof LlmError && error.retryable)) throw error;
    this.logger.warn(`retrying ${key}: ${error.message}`);
    return (await this.llm.generateStructured(request)).items;
  }
}
```

**La requête :**

- `purpose` : par exemple `question-batch:grammar`, pour les logs du provider.
- `schema` : le schéma du lot pour cette catégorie. Le provider s'en sert deux fois : pour **guider** Gemini (`responseJsonSchema`) et pour **valider** la réponse (`safeParse`).
- `...buildQuestionBatchPrompt(cell)` : la fonction renvoie `{ system, user }`, et le spread copie ces deux champs dans la requête.
- `as const` : sans ça, TypeScript donnerait à `purpose` le type `string`, qui ne correspond pas à `LlmPurpose` (`'question-batch:grammar' | ...`). Avec `as const`, il garde le type **exact** du texte, `` `question-batch:${QuestionCategory}` ``, qui correspond. (Ça rend aussi l'objet `readonly`, ce qui ne gêne pas.)

**Le type de retour, sans rien écrire.** `generateStructured(request)` déduit `S` de `request.schema`. Le schéma est typé `z.ZodType<GeneratedBatch>`, donc le résultat est un `GeneratedBatch`, et `.items` un `GeneratedItem[]`. Aucun `<GeneratedBatch>` écrit à la main.

**Le deuxième essai :**

- Premier essai dans le `try`.
- En cas d'erreur : `error instanceof LlmError && error.retryable`. `instanceof` vérifie la **classe** de l'erreur (dans un `catch`, TypeScript ne sait rien de son type), puis on lit `retryable`. Ça marche parce que `LlmError` est une vraie classe, qui existe à l'exécution.
- Si ce n'est **pas** une erreur retryable → `throw error` : on la relance, et `fill` l'attrape (→ `failed`).
- Sinon → log, puis **un seul** deuxième essai. S'il échoue aussi, son erreur remonte à `fill`.

Après le `if`, TypeScript sait que `error` est une `LlmError` (narrowing), d'où l'accès à `error.message` sans cast.

Au maximum **deux** appels au LLM par restock.

---

## 7. Qui appelle le module : `PlacementQuestionService`

Dans `placement/placement-question.service.ts`, à chaque fois qu'un apprenant demande une nouvelle question :

```ts
for (const cat of pool) {
  const questions = await this.prisma.questionBank.findMany({
    where: { lang: session.lang, level, category: cat,
             userSeenQuestions: { none: { userId } } },   // non vues par cet apprenant
    orderBy: { sourceId: { sort: 'asc', nulls: 'last' } }, // écrites d'abord
    take: LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,              // 100 max
  });

  availableByCategory[cat] = questions.length;
  void this.stock.restock({ lang: session.lang, level, category: cat }, questions.length);
  const written = questions.filter((question) => question.sourceId !== null);
  const servable = written.length > 0 ? written : questions;
  ...
}
```

- Pour chaque catégorie possible, on récupère les questions **non vues** par cet apprenant (au plus 100).
- `void this.stock.restock(...)` : on appelle le restock avec ce nombre, **sans l'attendre**. Le mot-clé `void` dit explicitement « je jette cette promesse exprès » : un lecteur sait que l'oubli d'`await` est volontaire. C'est sûr, puisque `restock` ne rejette jamais.
- L'apprenant reçoit sa question **tout de suite**. Le restock se fait en arrière-plan, et les nouvelles questions seront là pour les tirages suivants.
- Les questions **écrites** (`sourceId !== null`) passent avant les générées. Une question générée n'est servie que quand l'apprenant a vu toutes les écrites de la catégorie, parce que personne ne l'a relue.
- Si plus aucune question non vue n'existe, le placement ressert celle que l'apprenant a vue **il y a le plus longtemps** (`findFirst` trié par `updatedAt`). Comme la resservir met `updatedAt` à jour, les resservies tournent sur tout le niveau.

---

## 8. Le trajet complet d'un restock, avec un exemple

Situation : Léa passe le placement en français, elle est au niveau B1. Il ne lui reste que 2 questions de grammaire B1 non vues.

```
1. Léa demande une question
   PlacementQuestionService.getNewQuestion
     └─ findMany(fr, B1, grammar, non vues par Léa) → 2 questions
     └─ void stock.restock({fr, B1, grammar}, 2)    ← pas attendu
     └─ renvoie une des 2 questions à Léa          ← immédiat

2. En arrière-plan : restock({fr,B1,grammar}, 2)
     ├─ 2 > 3 ? non
     ├─ key = "fr:B1:grammar"
     ├─ inFlight.has(key) ? non
     ├─ en pause ? non
     ├─ job = fill(...).finally(supprimer de inFlight)
     └─ inFlight.set(key, job)

3. Pendant ce temps, Tom (aussi fr / B1, 1 question non vue) demande une question
     └─ restock({fr,B1,grammar}, 1)
          └─ inFlight.has("fr:B1:grammar") ? OUI → { status: 'busy' }
                 ← pas de deuxième appel au LLM

4. fill → generate
     ├─ request = { purpose: 'question-batch:grammar',
     │              schema: generatedBatchSchema('grammar'),
     │              system: '...13 questions, une par topic, B1, "fr"...',
     │              user: 'Write 13 B1 grammar questions in "fr", one per topic.' }
     └─ llm.generateStructured(request)
          ├─ 1er essai : Gemini renvoie 12 questions au lieu de 13
          │     → parseReply : échec du schéma → LlmError(retryable: true)
          ├─ log "retrying fr:B1:grammar: ..."
          └─ 2e essai : 13 questions valides ✓

5. fill (suite)
     ├─ findMany(fr, B1, grammar) → 40 questions existantes (question + readText)
     ├─ freshItems → 2 sont déjà en base, il en reste 11
     ├─ toRows → 11 lignes { ...item, lang:'fr', level:'B1', category:'grammar',
     │                       sourceId:null, timeLimitS:60 }
     ├─ createMany → count = 11
     ├─ log "restocked fr:B1:grammar: 11 of 13 questions were new"
     └─ { status: 'filled', inserted: 11 }

6. .finally → inFlight.delete("fr:B1:grammar")
   La cellule peut de nouveau être réapprovisionnée plus tard.
```

Variantes :

- Sans clé API (`LLM_PROVIDER=fixture`) : à l'étape 4, `FixtureProvider` lance une `LlmError` **non** retryable → pas de 2e essai → `fill` attrape → `failed` + pause 10 min. Léa et Tom continuent avec les questions existantes, puis avec les plus anciennes déjà vues.
- Gemini renvoie `429` deux fois : retryable, 2e essai, nouvel échec → `failed` + pause 10 min.
- Les 13 questions sont toutes des doublons : `count = 0` → `filled` avec `inserted: 0` + pause 10 min.

---

## 9. Ce qui a changé depuis la PR #69

### 9.1 Les fichiers

| Avant (#69)                                                           | Maintenant                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Dossier `questions-generation/` (avec un **s**)                       | `question-generation/`                                         |
| `questions-generation.module.ts`                                      | `question-generation.module.ts`                                |
| `questions-generation.service.ts` : 260 lignes qui faisaient **tout** | `question-stock.service.ts` : seulement le réapprovisionnement |
| —                                                                     | `question-batch.ts` : fonctions pures (nouveau)                |
| `prompts/generate-questions.prompt.ts`                                | `prompts/question-batch.prompt.ts`, beaucoup plus détaillé     |

### 9.2 La répartition des rôles

| Rôle                               | Avant                                           | Maintenant                      |
| ---------------------------------- | ----------------------------------------------- | ------------------------------- |
| Décider s'il faut réapprovisionner | service de génération (`getOrGenerateQuestion`) | `QuestionStockService.restock`  |
| Appeler le LLM                     | service de génération                           | `QuestionStockService.generate` |
| Valider la réponse du LLM          | service de génération (`safeParse`)             | **le provider** (`parseReply`)  |
| Choisir la question à servir       | service de génération (`serveQuestion`)         | `PlacementQuestionService`      |
| Ressortir une question déjà vue    | service de génération                           | `PlacementQuestionService`      |

Le service de génération faisait à la fois « remplir la banque » et « servir une question ». Ces deux rôles sont maintenant séparés.

### 9.3 Le comportement

| Aspect                | Avant                                               | Maintenant                                                              |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Seuil                 | `REPLENISH_WHEN_REMAINING_AT_MOST = 3`, exporté     | `RESTOCK_AT = 3`, privé au fichier                                      |
| Retour                | `triggerReplenish` renvoyait `void`                 | `restock` renvoie un `RestockOutcome` (testable)                        |
| Ne jamais planter     | `.catch(...)` ajouté sur le job                     | `try/catch` dans `fill` : `restock` ne rejette jamais                   |
| Retry                 | Boucle de 2 essais, **toute** erreur réessayée      | 2e essai **seulement** si `LlmError.retryable`                          |
| Après un échec        | Rien : réessayé à la question suivante              | **Pause de 10 minutes**                                                 |
| Lot sans rien de neuf | Inséré quand même                                   | Rien inséré + pause de 10 minutes                                       |
| Doublons              | Aucune vérification                                 | `freshItems` : contre la base **et** dans le lot                        |
| `timeLimitS`          | Donné par le **modèle**                             | Fixé par le **serveur** (`TIME_LIMIT_S`)                                |
| `level`               | Celui de la cellule (déjà)                          | Celui de la cellule (inchangé)                                          |
| Format dans le prompt | Décrit en texte                                     | Retiré du prompt, envoyé comme schéma JSON                              |
| Calibrage du niveau   | Bref                                                | Référence CECR complète, distracteurs, anti-patterns, auto-vérification |
| Sans clé API          | `FixtureProvider` insérait de **fausses questions** | `FixtureProvider` échoue : la banque reste propre                       |
| Questions servies     | Écrites et générées mélangées                       | Écrites d'abord, générées ensuite                                       |
| Fallback              | Au hasard parmi les 10 plus anciennes vues          | La plus ancienne vue, de façon déterministe                             |

---

## 10. Les tests

Le nom de chaque test dit ce qu'il vérifie. C'est une bonne façon de relire les règles du module.

**`question-batch.spec.ts`**

- `freshItems` : jette une question déjà dans la cellule, quelle que soit la casse ou les espaces ; garde une question qui diffère par un espace (« in to » / « into ») ; garde la première de deux questions répétées dans le lot ; distingue les questions de lecture par leur passage.
- `toRows` : range chaque question dans la cellule, non relue, avec le chrono de la cellule ; garde le passage d'une question de lecture.

**`prompts/question-batch.prompt.spec.ts`**

- grammaire : une question par topic, chacune avec un trou ;
- vocabulaire : des mots et expressions, pas de la grammaire, avec les topics de vocabulaire ;
- lecture : un passage par question, avec le topic de lecture.

**`question-stock.service.spec.ts`**

- ne touche pas une cellule tant que l'apprenant a plus de 3 questions non vues ;
- n'enregistre que les questions que la cellule n'a pas encore ;
- un seul restock par cellule à la fois (`busy`) ;
- pause de 10 minutes après un échec ;
- pause de 10 minutes après un lot sans rien de neuf, mais pas après un lot qui a ajouté quelque chose ;
- réessaie avec la même requête, et loggue pourquoi ;
- une panne de la base devient `failed`, jamais un rejet ;
- sans vrai LLM (fixture) : rien n'est enregistré, et la cellule part en pause.

Pour les lancer :

```sh
cd apps/api
npx vitest run src/question-generation src/llm
```

---

## 11. Mini-glossaire

| Terme               | Sens                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| cellule (`Cell`)    | langue + niveau + catégorie : `fr / B1 / grammar`                          |
| restock             | réapprovisionner une cellule avec un lot généré                            |
| lot (batch)         | les questions générées en un seul appel au LLM                             |
| distracteur         | une mauvaise option d'un QCM                                               |
| CECR (CEFR)         | le cadre européen des niveaux de langue, de A1 à C2                        |
| `sourceId`          | identifiant d'une question écrite à la main ; `null` = générée             |
| singleton           | une seule instance pour toute l'application                                |
| `Map`               | dictionnaire clé → valeur                                                  |
| `Set`               | collection sans doublons                                                   |
| spread `...`        | copie les champs d'un objet dans un autre                                  |
| `as const`          | garde le type le plus précis possible (le texte exact, pas `string`)       |
| `void promesse`     | « je n'attends pas cette promesse, exprès »                                |
| unhandled rejection | une `Promise` rejetée que personne n'écoute ; peut faire planter Node      |
| boucle d'événements | JavaScript fait une chose à la fois ; on ne change de tâche qu'aux `await` |
| `Omit<T, K>`        | le type `T` sans les champs `K`                                            |
| `Record<K, V>`      | un objet avec toutes les clés `K`, chacune de type `V`                     |
