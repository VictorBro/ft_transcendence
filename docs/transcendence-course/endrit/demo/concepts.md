# Concepts techniques du module démo, expliqués simplement

Retour au [README](README.md).

---

## 1. PRNG à graine fixe (générateur pseudo-aléatoire)

**PRNG** = *Pseudo-Random Number Generator*. C'est une petite formule qui produit une suite de nombres qui **ont l'air** aléatoires, mais qui est en fait **entièrement calculée** à partir d'un nombre de départ : la **graine** (*seed*).

**Analogie : un livre de nombres au hasard.** La graine, c'est le numéro de la page où on commence à lire. Deux personnes qui ouvrent le livre à la même page lisent exactement la même suite.

`Math.random()` de JavaScript, lui, a une graine qu'on ne choisit pas : chaque lancement donne une suite différente. C'est pour ça qu'on ne l'utilise pas ici.

Dans [demo.clock.ts](../../../../apps/api/src/demo/demo.clock.ts) :

```ts
/** A 32-bit seed from a text: FNV-1a, so each email gets its own run of scores. */
export function seedOf(text: string): number { /* ... */ }

/** A number in [0, 1), the same series for the same seed: mulberry32. */
export type Random = () => number;
export function randomFrom(seed: number): Random { /* ... */ }
```

- **`seedOf`** transforme un texte (ex. `"demo-anna@example.com/fr"`) en nombre de 32 bits avec le hash **FNV-1a** (un hash simple et rapide : on mélange chaque caractère dans un nombre avec un XOR et une multiplication).
- **`randomFrom(seed)`** renvoie une **fonction** : à chaque appel, elle donne le nombre suivant de la suite, entre 0 (inclus) et 1 (exclu). L'algorithme s'appelle **mulberry32**. Son état (`state`) est gardé dans une **closure** (une variable capturée par la fonction).
- **`Math.imul`** fait une multiplication sur 32 bits comme en C, et `>>> 0` force le résultat en entier positif de 32 bits. C'est ce qui rend le calcul **identique sur toutes les machines**.

### Pourquoi c'est déterministe

**Déterministe** = mêmes entrées → même résultat, à chaque fois.

- La graine dépend **seulement** de l'email et de la langue : pas de l'heure, pas du hasard.
- Le générateur n'utilise que des opérations entières exactes.
- Donc anna a **toujours** la même suite de scores. Deux seeds le même jour écrivent les mêmes lignes.

### Pourquoi c'est utile

- **Reproductible** : un bug vu sur la démo se reproduit chez tous les membres de l'équipe.
- **Testable** : `demo.planner.spec.ts` peut vérifier des résultats précis.
- **Stable** : la page de démo d'eva montre toujours « niveau terminé ».

### Les petites astuces du code

- **Une suite par apprenant ET par langue** (`randomOf(email, course)` utilise `` `${email}/${course.lang}` ``) : ajouter un cours d'allemand ne décale pas les scores du français.
- **`pastScore` tire toujours deux nombres** : le 1er décide « réussi ou raté » (`< passRate`), le 2e décide la valeur. Même si on change `passRate`, chaque score consomme deux tirages : les scores suivants ne bougent pas de place dans la suite.
  - réussi : entre `LESSON_PASS_MARK` (70) et 100 ;
  - raté : entre 0 et 69.
- **Une nouvelle suite pour le replay** : `daysToAttemptAll` consomme sa propre suite pour **compter** les jours. `planCourse` en recrée une **avec la même graine**. Le replay obtient donc exactement les scores utilisés pour le calcul.

---

## 2. L'horloge injectée (simulée)

Un code qui fait `new Date()` partout dépend de l'heure réelle : impossible de « revenir » il y a 12 jours. Ici, chaque fonction reçoit l'instant en paramètre :

- `seedDemo(prisma, { runNow })` : l'instant du lancement (le seed passe `new Date()`, le test e2e passe une date fixe) ;
- `lessons.today(userId, lang, timeZone, now)` et `lessons.finish(user, lang, id, score, now)` : les vrais services acceptent l'instant en paramètre.

On dit que l'horloge est **injectée** (comme on injecte une dépendance). C'est ce qui rend le replay jour par jour possible, et c'est aussi ce qui permet au test e2e d'utiliser une date fixe.

---

## 3. Le planificateur est « pur »

Une **fonction pure** n'a pas d'effet de bord (pas de base, pas de réseau, pas d'heure réelle) et renvoie toujours le même résultat pour les mêmes entrées. `demo.planner.ts` et `demo.clock.ts` sont purs : on les teste sans base de données dans [demo.planner.spec.ts](../../../../apps/api/src/demo/demo.planner.spec.ts).

Le planificateur **ne choisit pas** les leçons. Il dit seulement « ce jour-là, 3 leçons finies, à 19:00, 19:10, 19:20, avec tels scores ». C'est `LessonsService.today` qui dit **quelles** leçons, comme pour un vrai apprenant qui suit sa page du jour.

Les heures :
- **jours passés** : à partir de 19:00 locale, espacées de `LESSON_MINUTES` (10 min) ;
- **aujourd'hui** : réparties régulièrement entre minuit local et `runNow`, la première juste après minuit, aucune dans le futur.

---

## 4. Les fuseaux horaires

Une « journée » d'apprenant dépend de **son** fuseau. À 00:03 à Tokyo le 26 octobre, il est encore le 25 en UTC. La série doit compter le 26.

`atLocalTime(day, minutes, timeZone)` trouve l'instant UTC de « `day` à `minutes` après minuit dans `timeZone` » :
1. on écrit l'heure voulue comme si c'était de l'UTC ;
2. on retire le décalage du fuseau à cet instant (mesuré avec `Intl.DateTimeFormat`) ;
3. on **remesure** le décalage au résultat, car un jour de changement d'heure le décalage peut être différent.

Les tests vérifient par exemple que minuit le 29 mars 2026 à Berlin = `2026-03-28T23:00:00Z`.

---

## 5. Simuler les règles : `daysToAttemptAll`

Pour eva, le profil dit `{ untilAllAttempted: 6 }` : « 6 leçons par jour jusqu'à ce que tout soit tenté ». Combien de jours ? Ça dépend :
- du nombre de leçons prêtes du niveau ;
- des scores, car une leçon ratée est proposée **d'abord** le lendemain.

La fonction rejoue les **vraies** règles (`plan`, `merge` de `roadmap.rules.ts`) sur des jours inventés (à partir du 1er janvier 2000) : ces règles ne font que **comparer** des jours, donc le nombre trouvé est le même sur les vrais jours. Garde-fou : au-delà de 365 jours, c'est un profil mal écrit (un `passRate` de 0 ne finirait jamais), et on lève une erreur.

---

## 6. Idempotence et nettoyage

**Idempotent** = on peut relancer sans casser : le résultat final est le même.

`seedDemo` commence par `prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } })` : les six adresses exactes (`demo-anna@example.com` … `demo-felix@example.com`), pas un motif `demo-*`. La suppression **en cascade** enlève aussi les cours et résultats, les amitiés et les conversations (messages de l'autre côté compris). Puis il recrée tout. Des adresses exactes ne touchent **aucun** autre compte : ni un compte de test e2e (`browser-`, `learner-`, `replay-`…), ni quelqu'un qui s'inscrit en `demo-me@example.com` sur un serveur, où le seed tourne à chaque déploiement.
