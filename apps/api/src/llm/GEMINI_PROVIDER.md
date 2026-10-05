# `gemini.provider.ts` expliqué en entier

Fichier : `apps/api/src/llm/gemini.provider.ts`

Ce document explique **tout** le fichier, ligne par ligne, puis ce qui a changé depuis la PR #69.
Prérequis : avoir compris `llm.provider.ts` (le contrat `LlmProvider`, `StructuredRequest`, `LlmError`).

---

## 0. En une phrase

`GeminiProvider` prend une requête (`system`, `user`, `schema`), l'envoie à l'API Gemini de Google par HTTP, puis renvoie la réponse **déjà validée** par le schéma Zod. Si quelque chose rate, il lance une `LlmError` qui dit si un deuxième essai a une chance de marcher.

---

## 1. Vue d'ensemble : le trajet d'un appel

```
QuestionStockService
   │  llm.generateStructured({ purpose, system, user, schema })
   ▼
GeminiProvider.generateStructured
   │
   ├─ requestBody(request)        → construit le JSON envoyé à Google
   ├─ fetch(...)                  → envoie la requête HTTP
   │     └─ pas de réponse du tout ? → unreachable → LlmError (retryable)
   ├─ response.text()             → lit le corps de la réponse
   │     └─ coupure pendant la lecture ? → unreachable → LlmError (retryable)
   ├─ !response.ok ?              → LlmError (retryable selon isRetryable(status))
   ├─ parseJson(body, 'response') → le corps HTTP en objet
   │     └─ pas du JSON ? → LlmError (retryable)
   ├─ logger.log(...)             → tokens utilisés + durée
   ├─ replyText(reply)            → extrait le texte écrit par le modèle
   │     ├─ prompt bloqué ? → LlmError (pas retryable)
   │     └─ réponse incomplète ? → LlmError (pas retryable)
   └─ parseReply(schema, text)    → JSON.parse + validation Zod
         ├─ pas du JSON ? → LlmError (retryable)
         └─ ne respecte pas le schéma ? → LlmError (retryable)
   ▼
renvoie les données validées, du type z.output<S>
```

Le fichier est organisé ainsi :

- **en haut**, deux constantes et une interface (`GeminiReply`) ;
- **au milieu**, la classe, avec une seule méthode publique ;
- **en bas**, six petites fonctions privées au fichier, non exportées.

---

## 2. Les imports

```ts
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { LlmError, LlmProvider, StructuredRequest } from "./llm.provider";
```

- `Logger` : le logger de NestJS. Il écrit des lignes dans le terminal avec un préfixe (ici `[GeminiProvider]`).
- `z` : Zod. Cette fois c'est un **vrai import**, pas `import type`, car on appelle des fonctions de Zod à l'exécution : `z.toJSONSchema` et `z.prettifyError`. Dans `llm.provider.ts`, c'était `import type` parce que Zod n'y servait qu'aux types.
- `LlmError` (une classe, utilisée avec `new`), `LlmProvider` (l'interface qu'on implémente), `StructuredRequest` (le type de la requête).

---

## 3. Les constantes

```ts
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;
```

- `API` : l'adresse de base. À chaque appel, on ajoute `/<modèle>:generateContent`, ce qui donne par exemple :
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`
  `generateContent` est le nom de l'opération de Google : « génère une réponse ».
- `TIMEOUT_MS` : on attend au maximum 60 secondes. `60_000` vaut exactement `60000` ; le `_` n'a aucun effet, il sépare seulement les milliers pour la lecture (comme `1'000'000` en C++14).

---

## 4. L'interface `GeminiReply`

```ts
interface GeminiReply {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
```

C'est la forme de la réponse de Google, **réduite aux champs qu'on lit**. Google en envoie d'autres, qu'on ignore.

### Pourquoi tous les champs ont un `?`

Ce JSON vient de l'extérieur. On ne contrôle pas ce que Google envoie : un champ peut manquer, par exemple quand le prompt est bloqué et qu'il n'y a pas de `candidates`. En marquant tout optionnel, TypeScript nous **oblige** à vérifier avant d'utiliser, d'où les `?.` et `??` plus bas. Si on avait écrit `candidates: ...` sans `?`, TypeScript nous laisserait faire `reply.candidates[0]` sans vérification, et ça planterait à l'exécution le jour où le champ manque.

### La syntaxe `{ ... }[]`

`candidates?: { finishReason?: string; ... }[]` veut dire « un tableau d'objets qui ont cette forme ». C'est comme écrire `Array<{ ... }>`.

### Ce que veut dire chaque champ

| Champ                         | Sens                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promptFeedback.blockReason`  | Présent si Google a **refusé** notre prompt (filtres de sécurité). Exemple : `"SAFETY"`.                                                                                                |
| `candidates`                  | Les réponses proposées. On n'en demande qu'une, donc on lit `candidates[0]`.                                                                                                            |
| `candidates[0].finishReason`  | Pourquoi le modèle a arrêté d'écrire. `"STOP"` = il a fini normalement. Autres valeurs : `"MAX_TOKENS"` (coupé car trop long), `"SAFETY"` (coupé par les filtres), `"RECITATION"`, etc. |
| `candidates[0].content.parts` | Le texte de la réponse, parfois découpé en plusieurs morceaux.                                                                                                                          |
| `parts[i].text`               | Le texte d'un morceau.                                                                                                                                                                  |
| `parts[i].thought`            | `true` si ce morceau est le **raisonnement** du modèle (les modèles « thinking »), pas la réponse.                                                                                      |
| `usageMetadata`               | Le nombre de tokens utilisés : en entrée (`prompt`), en sortie (`candidates`), au total. C'est ce qui est facturé.                                                                      |

Exemple de réponse réussie, simplifiée :

```json
{
  "candidates": [
    {
      "finishReason": "STOP",
      "content": { "parts": [{ "text": "{\"items\":[{\"topic\":\"pronouns\", ...}]}" }] }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 5200,
    "candidatesTokenCount": 1800,
    "totalTokenCount": 7000
  }
}
```

À noter : la réponse du modèle (`text`) est elle-même une **chaîne qui contient du JSON**. Il y a donc **deux** `JSON.parse` : un pour l'enveloppe de Google, un pour le texte du modèle.

---

## 5. La classe

```ts
export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly options: { apiKey: string; model: string }) {}
```

### `implements LlmProvider`

La classe promet de respecter le contrat. Si `generateStructured` manquait ou avait une mauvaise signature, la compilation échouerait **ici**.

### Pas de `@Injectable()`

C'est voulu. NestJS ne construit pas cette classe : c'est `llm.factory.ts` qui fait `new GeminiProvider({ apiKey, model })`, après avoir vérifié que la clé existe. Le résultat est ensuite enregistré sous le jeton `LLM_PROVIDER`.

### `GeminiProvider.name`

Toute classe a une propriété `.name` qui contient son nom en texte : `'GeminiProvider'`. Le logger l'utilise comme préfixe. Écrire `GeminiProvider.name` plutôt que `'GeminiProvider'` évite d'oublier de mettre le texte à jour si on renomme la classe.

### `private readonly options` dans le constructeur

C'est le raccourci TypeScript déjà vu avec `LlmError`. Ça déclare un champ `options` **et** le remplit avec l'argument. Équivalent long :

```ts
private readonly options: { apiKey: string; model: string };
constructor(options: { apiKey: string; model: string }) {
  this.options = options;
}
```

Le corps du constructeur `{}` est vide parce qu'il n'y a rien d'autre à faire.

`{ apiKey: string; model: string }` est un **type écrit sur place** (sans lui donner de nom). La classe ne lit jamais le `.env` elle-même : elle reçoit tout de l'extérieur. C'est ce qui la rend facile à tester (`new GeminiProvider({ apiKey: 'test', model: 'x' })`).

---

## 6. La méthode `generateStructured`, ligne par ligne

```ts
async generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<z.output<S>> {
```

Même signature que dans le contrat (voir `llm.provider.ts`). `S` est le type du schéma passé dans `request.schema` ; le retour est le type des données validées par ce schéma.

### 6.1 Préparation

```ts
const { apiKey, model } = this.options;
const started = Date.now();
```

- Déstructuration : on sort `apiKey` et `model` de `this.options` en deux variables.
- `Date.now()` renvoie l'heure actuelle en millisecondes. On la garde pour calculer la durée de l'appel à la fin.

### 6.2 L'appel HTTP

```ts
const response = await fetch(`${API}/${model}:generateContent`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
  body: JSON.stringify(requestBody(request)),
  signal: AbortSignal.timeout(TIMEOUT_MS),
}).catch(unreachable);
```

`fetch` est la fonction standard (intégrée à Node 18+) pour faire une requête HTTP. Elle renvoie une `Promise<Response>`.

| Option                                | Rôle                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `method: 'POST'`                      | On **envoie** des données (le prompt).                                                        |
| `'content-type': 'application/json'`  | On prévient le serveur que le corps est du JSON.                                              |
| `'x-goog-api-key': apiKey`            | La clé API. Elle est dans un **header**, pas dans l'URL.                                      |
| `body`                                | Le corps : `requestBody(request)` construit l'objet, `JSON.stringify` le transforme en texte. |
| `signal: AbortSignal.timeout(60_000)` | Annule automatiquement la requête au bout de 60 s.                                            |

**Pourquoi la clé dans un header et pas dans l'URL ?** Avant (#69), l'URL contenait `?key=...`. Une URL finit souvent dans des logs (proxy, serveur, messages d'erreur). Un header beaucoup moins. C'est plus sûr.

**Quand est-ce que `fetch` rejette ?** Seulement quand il n'y a **aucune réponse HTTP** : pas de réseau, nom de domaine introuvable, connexion coupée, ou timeout atteint. Attention : une réponse `500` ou `429` **n'est pas** un rejet pour `fetch`. Il y a bien eu une réponse, juste une réponse d'erreur. Ce cas est traité plus bas avec `response.ok`.

**`.catch(unreachable)`** : si `fetch` rejette, on appelle `unreachable`, qui lance une `LlmError` retryable. Comme `unreachable` renvoie `never` (elle ne renvoie jamais rien, elle lance toujours), TypeScript sait que le `.catch` ne peut pas produire d'autre valeur. `response` garde donc le type `Response`, et pas `Response | undefined`.

### 6.3 La lecture du corps

```ts
const body = await response.text().catch(unreachable);
```

Une réponse HTTP arrive en deux temps : d'abord le statut et les en-têtes (c'est ce qu'attend `await fetch`), puis le corps (c'est ce qu'attend `await response.text()`). Le timeout couvre **les deux étapes**, et la connexion peut aussi tomber pendant la lecture du corps. D'où le même `.catch(unreachable)`.

**Pourquoi `text()` et pas `json()` ?**

- Si la réponse est une erreur (`500`, page HTML d'un proxy...), on veut pouvoir mettre son **texte** dans le message d'erreur. Avec `json()`, on aurait juste un « Unexpected token < » sans voir le contenu.
- On fait le `JSON.parse` nous-mêmes, avec `parseJson`, pour transformer l'échec en `LlmError` propre.

### 6.4 Le statut HTTP

```ts
if (!response.ok) {
  throw new LlmError(`Gemini ${response.status}: ${body}`, isRetryable(response.status));
}
```

`response.ok` vaut `true` si le statut est entre 200 et 299. Sinon on lance une `LlmError` avec le statut et le corps (Google y explique l'erreur). `isRetryable` décide si ça vaut le coup de réessayer (voir section 8).

### 6.5 Le JSON de Google et le log

```ts
const reply = parseJson(body, "response") as GeminiReply;
const usage = reply.usageMetadata;
this.logger.log(
  `${request.purpose} on ${model}: ${usage?.promptTokenCount ?? "?"} in, ` +
    `${usage?.candidatesTokenCount ?? "?"} out, ${usage?.totalTokenCount ?? "?"} total tokens, ` +
    `${Date.now() - started} ms`,
);
```

- `parseJson` renvoie `unknown` : TypeScript ne sait rien de la forme. `unknown` est le type « je ne sais pas » ; on ne peut rien en faire tant qu'on n'a pas vérifié ou converti.
- `as GeminiReply` est une **assertion de type** : « traite cette valeur comme un `GeminiReply` ». Ça ne **vérifie rien** à l'exécution, c'est l'équivalent d'un `static_cast` qu'on fait en confiance. C'est acceptable ici parce que tous les champs de `GeminiReply` sont optionnels : le pire cas, c'est un champ `undefined`, qu'on gère déjà.
- `usage?.promptTokenCount` : le `?.` (_optional chaining_) renvoie `undefined` si `usage` est `undefined`, au lieu de planter.
- `?? '?'` (_nullish coalescing_) : si la valeur à gauche est `null` ou `undefined`, on prend celle de droite. On affiche donc `?` quand Google n'a pas donné le chiffre.
- `request.purpose` (par exemple `question-batch:grammar`) dit à quoi servait l'appel. C'est exactement pour ça qu'il existe.

Exemple de ligne de log :

```
[GeminiProvider] question-batch:grammar on gemini-3.6-flash: 5200 in, 1800 out, 7000 total tokens, 8432 ms
```

C'est utile pour voir ce que coûte chaque restock et combien de temps il prend.

**Remarque :** le log est écrit **avant** de vérifier la réponse du modèle. Même un appel qui échoue ensuite (réponse coupée, schéma pas respecté) apparaît dans les logs avec ses tokens, et ces tokens ont bien été facturés.

### 6.6 Le résultat

```ts
return parseReply(request.schema, replyText(reply));
```

Deux étapes, de l'intérieur vers l'extérieur :

1. `replyText(reply)` sort le texte écrit par le modèle, ou lance une erreur.
2. `parseReply(schema, text)` le transforme en objet et le valide avec Zod, ou lance une erreur.

Le type de retour de `parseReply` est `z.output<S>`, exactement ce que promet la méthode.

---

## 7. `requestBody` : ce qu'on envoie à Google

```ts
function requestBody({ system, user, schema }: StructuredRequest<z.ZodType>) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema),
    },
  };
}
```

- Le paramètre est déstructuré directement : on ne garde que `system`, `user` et `schema` (`purpose` ne part pas chez Google, il sert juste à nos logs).
- `StructuredRequest<z.ZodType>` : ici on n'a pas besoin de savoir **quel** schéma précis, n'importe lequel convient. Pas besoin de générique `<S>`.
- Pas de type de retour écrit : TypeScript le **déduit** de l'objet renvoyé.

| Champ                                 | Sens                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `systemInstruction`                   | Les consignes générales et le rôle (`system`). Google attend une liste de `parts`, d'où `{ parts: [{ text }] }`. |
| `contents`                            | La conversation. Ici, un seul message, de l'utilisateur, avec notre `user`.                                      |
| `generationConfig.responseMimeType`   | `'application/json'` : « réponds uniquement en JSON ».                                                           |
| `generationConfig.responseJsonSchema` | La **forme** exacte que le JSON doit avoir.                                                                      |

### `z.toJSONSchema(schema)` : le point clé

_JSON Schema_ est un format standard pour décrire la forme d'un JSON. Zod sait convertir un schéma Zod dans ce format. Exemple :

```ts
z.object({ items: z.array(z.object({ question: z.string().min(1) })).length(5) });
```

devient

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "minItems": 5,
      "maxItems": 5,
      "items": {
        "type": "object",
        "properties": { "question": { "type": "string", "minLength": 1 } },
        "required": ["question"],
        "additionalProperties": false
      }
    }
  },
  "required": ["items"],
  "additionalProperties": false
}
```

Gemini reçoit ce schéma et **contraint sa génération** pour le respecter : les bons champs, les bons types, la bonne taille de tableau. Pas de texte autour, pas de ` ```json `.

**Limite importante :** les règles écrites avec `.refine(...)` dans Zod sont du **code** (une fonction), pas une forme. Elles ne peuvent pas être traduites en JSON Schema et sont simplement **ignorées** par `toJSONSchema`. Pour les questions, ça concerne :

- « la réponse doit apparaître dans les options » ;
- « les options doivent toutes être différentes » ;
- « exactement une question par topic » (grammaire) ;
- « chaque passage de lecture doit être différent ».

Gemini ne voit jamais ces règles via le schéma. C'est le **prompt** qui les lui demande en texte, et c'est `parseReply` (le `safeParse`) qui les **vérifie** au retour. C'est pour ça que les deux existent : le schéma JSON guide la forme, la validation Zod vérifie tout.

(Vérifié avec Zod 4.4.3, la version du projet : `.length(5)` devient bien `minItems/maxItems: 5`, et les `.refine` disparaissent.)

---

## 8. `unreachable` et `isRetryable` : les erreurs réseau et HTTP

```ts
function unreachable(error: Error): never {
  throw new LlmError(`Gemini unreachable: ${error.message}`, true);
}
```

Elle est appelée quand on n'a **aucune réponse** : pas de réseau, timeout, connexion coupée. Elle est **retryable** : le réseau peut revenir une seconde plus tard.
Elle renvoie `never` : elle ne termine jamais normalement, elle lance toujours. C'est ce qui permet de l'utiliser dans `.catch(...)` sans changer le type du résultat (voir 6.2).

```ts
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
```

| Statut                | Sens                                                  | Réessayer ?                             |
| --------------------- | ----------------------------------------------------- | --------------------------------------- |
| 408                   | Request Timeout (le serveur a trop attendu)           | oui, c'est temporaire                   |
| 429                   | Too Many Requests (limite de débit, quota par minute) | oui, ça se libère                       |
| 500, 502, 503, 504... | Panne côté Google                                     | oui, souvent temporaire                 |
| 400                   | Bad Request (notre requête est mal formée)            | non, elle sera mal formée à l'identique |
| 401 / 403             | Clé invalide ou sans droits                           | non                                     |
| 404                   | Modèle inconnu (faute de frappe dans `LLM_MODEL`)     | non                                     |

Le commentaire d'origine résume : _« Rate limits, timeouts and server faults pass; any other status fails the same way twice. »_

---

## 9. `replyText` : extraire la réponse du modèle

```ts
function replyText(reply: GeminiReply): string {
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false);

  const candidate = reply.candidates?.[0];
  if (candidate?.finishReason !== "STOP") {
    const reason = candidate ? (candidate.finishReason ?? "no finish reason") : "no candidate";
    throw new LlmError(`Gemini stopped early: ${reason}`, false);
  }
  return (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .join("");
}
```

### Étape 1 : prompt bloqué

Si `promptFeedback.blockReason` existe, Google a refusé le prompt **avant** de générer quoi que ce soit. **Pas retryable** : le même prompt sera bloqué de la même façon.

### Étape 2 : réponse incomplète

- `reply.candidates?.[0]` : le premier candidat, ou `undefined` si la liste manque. La syntaxe `?.[0]` est l'optional chaining appliqué à un index de tableau.
- `candidate?.finishReason !== 'STOP'` couvre **trois cas d'un coup** :
  - pas de candidat du tout → `candidate?.finishReason` vaut `undefined`, qui est différent de `'STOP'` ;
  - un candidat sans `finishReason` → `undefined`, différent de `'STOP'` ;
  - un candidat arrêté pour une autre raison (`MAX_TOKENS`, `SAFETY`...).
- Le message distingue ces cas avec un ternaire imbriqué : s'il y a un candidat, on affiche sa raison (ou `no finish reason`) ; sinon `no candidate`.
- **Pas retryable** : une réponse coupée par `MAX_TOKENS` sera trop longue à nouveau ; une réponse bloquée par `SAFETY` le sera encore.

### Étape 3 : rassembler le texte

Après le `if`, TypeScript **sait** que `candidate` n'est pas `undefined` : sinon on aurait lancé une erreur. C'est le _narrowing_ (rétrécissement de type). C'est pour ça qu'on peut écrire `candidate.content` sans `?.` sur `candidate`.

Puis une chaîne de méthodes de tableau :

| Méthode                            | Ce qu'elle fait ici                                              |
| ---------------------------------- | ---------------------------------------------------------------- |
| `candidate.content?.parts ?? []`   | les morceaux, ou un tableau vide s'il n'y en a pas               |
| `.filter((part) => !part.thought)` | garde seulement les morceaux qui **ne sont pas** du raisonnement |
| `.map((part) => part.text)`        | transforme chaque morceau en son texte (`string` ou `undefined`) |
| `.join('')`                        | colle tout bout à bout, sans séparateur                          |

`.join` écrit `undefined` comme une chaîne vide, donc un morceau sans texte ne casse rien.

**Pourquoi filtrer `thought` ?** Les modèles « thinking » peuvent renvoyer leur raisonnement dans des morceaux à part, marqués `thought: true`. Ce n'est pas du JSON de réponse : si on le collait au reste, le `JSON.parse` échouerait.

---

## 10. `parseReply` : valider la réponse

```ts
function parseReply<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  const result = schema.safeParse(parseJson(text, "reply"));
  if (!result.success) throw new LlmError(z.prettifyError(result.error), true);
  return result.data;
}
```

- Générique `<S>` : comme `generateStructured`, le type de retour vient du schéma passé.
- `parseJson(text, 'reply')` : le texte du modèle en objet (ou une `LlmError` si ce n'est pas du JSON).
- `schema.safeParse(...)` : la validation Zod. `safeParse` **ne lance jamais**, il renvoie un objet :
  - `{ success: true, data }` : `data` est la valeur validée, typée `z.output<S>` ;
  - `{ success: false, error }` : `error` décrit ce qui ne va pas.
    (À l'inverse, `schema.parse(...)` lancerait directement une `ZodError`. On préfère `safeParse` pour lancer **notre** `LlmError`.)
- `z.prettifyError(result.error)` : transforme l'erreur Zod en texte lisible pour les logs, par exemple :
  ```
  ✖ answer must appear verbatim in options
    → at items[3].answer
  ```
- **Retryable** : le modèle ne répond jamais deux fois exactement pareil (la génération est aléatoire, on parle d'_échantillonnage_). Une réponse mal formée peut donc être correcte au deuxième essai.

C'est ici que sont vérifiées les règles `.refine` que Gemini n'a pas reçues via le schéma (voir section 7).

---

## 11. `parseJson` : un `JSON.parse` qui lance la bonne erreur

```ts
function parseJson(text: string, what: "response" | "reply"): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(`Gemini ${what} is not JSON: ${text.slice(0, 200)}`, true);
  }
}
```

- `JSON.parse` lance une `SyntaxError` si le texte n'est pas du JSON valide. On la transforme en `LlmError`, pour que le service de stock sache quoi faire.
- `what: 'response' | 'reply'` : seulement deux valeurs possibles. Le message dit **quel** texte a échoué :
  - `'response'` : le corps HTTP de Google (section 6.5) ;
  - `'reply'` : le texte écrit par le modèle (section 10).
- `catch {` sans `(error)` : on n'a pas besoin de l'erreur d'origine, la syntaxe permet de l'omettre.
- `text.slice(0, 200)` : seulement les 200 premiers caractères, pour ne pas inonder les logs.
- Renvoie `unknown`, pas `any` : l'appelant **doit** vérifier ou convertir avant d'utiliser la valeur. `any` désactiverait toute vérification de TypeScript, `unknown` force à être prudent.
- **Retryable dans les deux cas.** Pour `'reply'`, même raison que `parseReply`. Pour `'response'`, un statut 200 dont le corps n'est pas du JSON vient presque toujours d'un **proxy** sur le chemin qui renvoie sa propre page d'erreur HTML : c'est temporaire.

---

## 12. Tableau récapitulatif de toutes les erreurs

| Situation                                     | Où                                   | Message                            | Retryable |
| --------------------------------------------- | ------------------------------------ | ---------------------------------- | --------- |
| Pas de réseau, DNS, timeout, connexion coupée | `unreachable`                        | `Gemini unreachable: ...`          | **oui**   |
| Statut 408, 429, 5xx                          | `generateStructured` + `isRetryable` | `Gemini 503: ...`                  | **oui**   |
| Autre statut non 2xx (400, 401, 403, 404...)  | `generateStructured` + `isRetryable` | `Gemini 400: ...`                  | non       |
| Corps HTTP qui n'est pas du JSON              | `parseJson(..., 'response')`         | `Gemini response is not JSON: ...` | **oui**   |
| Prompt bloqué                                 | `replyText`                          | `Gemini blocked the prompt: ...`   | non       |
| Pas de candidat, ou arrêt autre que `STOP`    | `replyText`                          | `Gemini stopped early: ...`        | non       |
| Texte du modèle qui n'est pas du JSON         | `parseJson(..., 'reply')`            | `Gemini reply is not JSON: ...`    | **oui**   |
| JSON qui ne respecte pas le schéma            | `parseReply`                         | message de `z.prettifyError`       | **oui**   |

Ce que fait ensuite `QuestionStockService` :

- retryable → **un** deuxième essai ;
- pas retryable, ou deuxième essai raté → la cellule est marquée en échec et laissée tranquille 10 minutes.

---

## 13. Ce qui a changé depuis la PR #69

| Aspect                         | Avant (#69)                                                               | Maintenant                                                                                |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Construction                   | `@Injectable()`, reçoit `ConfigService`, lit le `.env` à **chaque appel** | Pas d'`@Injectable()`, reçoit `{ apiKey, model }` une fois, via la factory                |
| Clé manquante                  | Erreur au **premier appel**                                               | Erreur au **démarrage** (dans la factory)                                                 |
| Modèle par défaut              | `gemini-3.1-flash-lite`, écrit dans le provider                           | `gemini-3.6-flash`, écrit dans la factory                                                 |
| Clé API                        | Dans l'URL (`?key=...`)                                                   | Dans un header (`x-goog-api-key`)                                                         |
| Signature                      | `generateStructured<T>(prompt: { system?, user }): Promise<T>`            | `generateStructured<S>(request: { purpose, system, user, schema }): Promise<z.output<S>>` |
| Type de retour                 | Choisi par l'appelant, **jamais vérifié** (un cast)                       | Déduit du schéma, **validé** par Zod                                                      |
| Format JSON                    | Seulement `responseMimeType: 'application/json'`                          | En plus, `responseJsonSchema` : Gemini suit la forme exacte                               |
| Nettoyage du texte             | Retirait à la main les ` ```json ` autour                                 | Inutile : la forme est contrainte par le schéma                                           |
| Lecture de la réponse          | `candidates[0].content.parts[0].text`, seulement le premier morceau       | Tous les morceaux sauf le raisonnement (`thought`), collés ensemble                       |
| Prompt bloqué / réponse coupée | Non détecté : on parsait ce qu'il y avait, ou « no response text »        | Détecté et signalé clairement, pas retryable                                              |
| Erreurs                        | Des `Error` simples ; le service réessayait **tout** une fois             | Des `LlmError` avec `retryable` ; le service ne réessaie que ce qui peut marcher          |
| Validation                     | Faite par le service (`safeParse` dans `questions-generation.service.ts`) | Faite par le provider (`parseReply`)                                                      |
| Logs                           | Aucun dans le provider                                                    | Tokens entrée / sortie / total et durée, avec le `purpose`                                |
| `system`                       | Optionnel                                                                 | Obligatoire                                                                               |

L'idée générale : **le provider est devenu une boîte noire fiable**. Il reçoit une requête et un schéma, et il renvoie soit des données valides et typées, soit une `LlmError` qui dit si on peut réessayer. Le code qui l'utilise n'a plus besoin de connaître Gemini, HTTP, ni la forme de la réponse de Google.

---

## 14. Mini-glossaire

| Terme                     | Sens                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `fetch`                   | Fonction standard pour faire une requête HTTP. Renvoie une `Promise<Response>`.                 |
| `Response.ok`             | `true` si le statut HTTP est entre 200 et 299.                                                  |
| `AbortSignal.timeout(ms)` | Un signal qui annule la requête au bout de `ms` millisecondes.                                  |
| header                    | Une information envoyée avec la requête HTTP, à côté du corps (clé, type de contenu...).        |
| token                     | Un morceau de mot. Les LLM comptent (et facturent) en tokens.                                   |
| `unknown`                 | « Type inconnu » : il faut vérifier avant de s'en servir. Plus sûr que `any`.                   |
| `as X`                    | Assertion de type : « fais-moi confiance, c'est un X ». Ne vérifie rien à l'exécution.          |
| `?.`                      | Optional chaining : renvoie `undefined` au lieu de planter si la gauche est `null`/`undefined`. |
| `??`                      | Nullish coalescing : valeur de secours si la gauche est `null`/`undefined`.                     |
| `never`                   | Type d'une fonction qui ne termine jamais normalement (elle lance toujours).                    |
| narrowing                 | TypeScript réduit un type après une vérification (`if (!x) throw` → ensuite `x` est défini).    |
| JSON Schema               | Format standard qui décrit la forme d'un JSON.                                                  |
| `safeParse`               | Validation Zod qui ne lance pas : renvoie `{ success, data }` ou `{ success, error }`.          |
