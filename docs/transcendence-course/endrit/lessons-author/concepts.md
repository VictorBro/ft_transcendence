# Concepts techniques de `lessons:author`, expliqués simplement

Retour au [README](README.md).

---

## 1. `child_process` : lancer un autre programme depuis Node

**Un processus**, c'est un programme qui tourne. Notre script Node est un processus. Il peut lancer **un autre** programme : on l'appelle le **processus enfant** (child process). Le module Node `node:child_process` sert à ça.

Chaque processus a trois « tuyaux » standard :
- **stdin** (entrée standard) : ce qu'on lui écrit, comme si on tapait au clavier ;
- **stdout** (sortie standard) : ce qu'il affiche normalement ;
- **stderr** (sortie d'erreur) : ses messages d'erreur.

**Analogie :** on passe un message à quelqu'un dans une autre pièce par un tube (stdin), il répond par un autre tube (stdout), et râle par un troisième (stderr).

Dans [providers/claude.ts](../../../../apps/api/scripts/lessons/providers/claude.ts) :

```ts
const child = spawn(bin, args, { cwd: WORK_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
// [...]
child.stdout.on('data', (d) => (stdout += d));
child.stderr.on('data', (d) => (stderr += d));
child.on('error', (e) => settle(() => reject(e)));
child.on('close', (code) =>
  settle(() => {
    // [...] JSON.parse(stdout), puis resolve ou reject
  }),
);
child.stdin.end(prompt);
```

(`// [...]` marque les lignes coupées.) Les données de stdout arrivent morceau par morceau et sont accumulées dans `stdout`. `stdin.end(prompt)` écrit le prompt puis ferme stdin.

- **`spawn`** lance le programme **sans attendre** sa fin (asynchrone). On reçoit les données au fur et à mesure (événements `data`), puis l'événement `close` à la fin.
- **`spawnSync`** (utilisé dans `findClaude`) attend la fin. Il sert juste à tester si `claude --version` marche.
- **`stdio: ['pipe','pipe','pipe']`** : les trois tuyaux sont reliés à notre script.
- **`stdin.end(prompt)`** : écrit le prompt et **ferme** l'entrée. `claude -p` sait alors que le message est complet.
- **Pourquoi stdin et pas un argument ?** Un prompt peut être très long ; la ligne de commande a une taille limite et le texte n'a pas besoin d'être échappé.
- **`cwd: WORK_DIR`** : le dossier de travail de l'enfant est un dossier temporaire, hors du dépôt.
- Le tout est enveloppé dans une **`Promise`** : `resolve` quand la sortie est un JSON correct, `reject` sinon. Le drapeau `settled` empêche de répondre deux fois (par exemple timeout puis `close`).
- **Timeout** : un `setTimeout` envoie `SIGTERM` (« arrête-toi poliment »), puis `SIGKILL` (« arrêt forcé ») 5 s plus tard. `.unref()` évite que ce minuteur garde Node en vie pour rien.

---

## 2. Le mode headless de Claude Code

`claude -p` (« print ») : Claude Code répond **une fois** sans interface, puis s'arrête. `--output-format json` : la sortie est un objet JSON avec, entre autres, `result` (le texte), `session_id`, `usage` (jetons), `total_cost_usd`, `is_error`. `--resume <id>` reprend une conversation existante : c'est ce qui permet au modèle de **corriger** sa leçon au lieu de la réécrire.

**Jeton (token)** : un petit morceau de texte (environ un bout de mot). Les modèles comptent leur travail en jetons. Le rapport distingue jetons d'entrée, de sortie, et lus depuis le **cache** (texte déjà vu, moins cher : c'est le prompt système, identique pour toutes les leçons d'un type).

---

## 3. Pourquoi versionner les prompts (`PROMPT_VERSION`)

Un **prompt**, c'est le texte d'instructions qu'on donne au modèle. Quand on le modifie, les leçons produites changent aussi. Sans version, on ne saurait plus **quelle** consigne a produit **quelle** leçon.

Dans [prompt.ts](../../../../apps/api/scripts/lessons/prompt.ts) :

```ts
/** Raise it when the prompt changes: every file records the version it was written with. */
export const PROMPT_VERSION = 'author-4';
```

`complete.ts` recopie cette valeur dans `provenance.promptVersion` de chaque fichier.

Ça sert à :
- **tracer** : on voit dans le fichier quel prompt l'a écrit (dans le dépôt, des leçons en `author-2` et d'autres en `author-3` ; la version actuelle, `author-4` (#208), n'a encore écrit aucun fichier) ;
- **refaire de façon ciblée** : si `author-2` produisait un défaut, on retrouve exactement les leçons concernées ;
- **comparer** : la qualité ou le nombre d'essais avant/après un changement de prompt.

C'est la même idée qu'un numéro de version de schéma de base de données : on note **avec quoi** une donnée a été produite. `lessons:check --write` (utilisé par la skill) enregistre aussi `PROMPT_VERSION`, avec `model: 'claude-code'` par défaut (option `--model` pour en mettre un autre).

Les trois prompts :
- **`systemPrompt(kind)`** : les règles d'un type (code source des schémas et validateurs, une leçon exemple qui passe, le format de réponse, ce que les validateurs ne peuvent pas voir). Identique pour toutes les leçons d'un type.
- **`lessonPrompt(...)`** : ce qui change par leçon (l'entrée d'outline, 5 voisines de chaque côté, les titres déjà pris).
- **`issuesPrompt(issues, editProblems)`** : les messages suivants, la liste des problèmes et des edits qui n'ont pas pu s'appliquer.

---

## 4. Rate limit, quota, HTTP 429

- **HTTP 429 « Too Many Requests »** : le serveur dit « tu vas trop vite, reviens plus tard ». C'est temporaire. Chez nous : `RateLimitError`.
- **Quota / usage limit** : l'abonnement a consommé son crédit pour la période. Réessayer dans 2 minutes ne sert à rien. Chez nous : `QuotaError`.

La fonction `refusal(status, message)` dans [providers/chat.ts](../../../../apps/api/scripts/lessons/providers/chat.ts) classe un refus. L'ordre compte : on teste d'abord « rate limit » (car un message de rate limit contient aussi « limit reached »), puis les mots du quota, puis le statut 429. Les expressions sont **étroites exprès** : un crash qui parle d'une « memory limit » ne doit pas arrêter tout le lancement.

---

## 5. Backoff exponentiel

**Backoff** = « reculer » : après un refus, on attend avant de réessayer. **Exponentiel** = chaque attente est **plus longue** que la précédente (souvent le double).

```ts
/** The pauses before each retry: 30 s, 1 min, 2 min, then the run stops. */
export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];
```

`retryRateLimits(call)` :
1. essaie ; si `RateLimitError`, affiche un message, attend 30 s ;
2. réessaie ; si encore, attend 1 min ;
3. réessaie ; si encore, attend 2 min ;
4. dernier essai ; si encore rate limit, **la limite n'est pas courte** : on la transforme en `QuotaError` et le lancement s'arrête.

Toute autre erreur est relancée tout de suite (pas de réessai).

**Pourquoi doubler ?** Si le serveur est surchargé, réessayer vite aggrave la surcharge. Attendre de plus en plus longtemps laisse le temps au serveur de se libérer, avec peu d'essais au total. Ici les délais sont une **liste fixe** (pas de hasard ajouté, ce qu'on appelle « jitter »).

**Analogie :** quelqu'un ne répond pas au téléphone. Tu rappelles dans 30 s, puis 1 min, puis 2 min. Après ça, tu te dis qu'il est absent pour la journée (quota) et tu arrêtes.

---

## 6. Les « edits » : corriger sans tout renvoyer

Au lieu de renvoyer toute la leçon pour 3 fautes, le modèle peut envoyer :

```json
{"edits":[{"file":"brief","path":"targets.3.examForms","value":["un livre"]},
          {"file":"content","path":"steps.2.pages.0.items.1","delete":true}]}
```

- Le **chemin** est celui des problèmes : des clés séparées par des points, les nombres sont des indices de liste.
- Les remplacements (`value`) s'appliquent d'abord, dans l'ordre. Les suppressions ensuite, **de l'indice le plus grand au plus petit** : supprimer 1 puis 3 enlève bien ces deux-là (sinon, après avoir supprimé 1, l'ancien 4 deviendrait 3).
- Rien n'est deviné : un chemin faux revient au modèle comme problème.

Avantage : moins de jetons, réponse plus rapide, moins de risque de casser ce qui était bon.

---

## 7. Le pool de concurrence

`pool(items, concurrency, work, stopped)` dans [author.ts](../../../../apps/api/scripts/lessons/author.ts) crée `concurrency` « workers ». Chaque worker fait : « tant qu'il reste des leçons et qu'on n'a pas demandé l'arrêt, prends la suivante et traite-la ». `Promise.all` attend qu'ils aient tous fini. Ça renvoie le nombre de leçons **jamais commencées** (pour le résumé).

Ce n'est pas du multithread : Node a un seul fil d'exécution, mais pendant qu'une leçon **attend** `claude` (entrée/sortie), l'autre peut avancer.

---

## 8. Provenance et hash

`sha256(value)` dans [json.ts](../../../../apps/api/scripts/lessons/json.ts) hache `canonicalJson(value)` :
- **`canonicalJson`** trie les clés : le même objet donne toujours le même texte ;
- **sha256** transforme ce texte en empreinte unique de 64 caractères.

Le brief garde l'empreinte de l'entrée d'outline ; le contenu garde celle de l'outline **et** du brief. Si l'outline change plus tard, on peut voir que la leçon a été écrite pour une autre version.
