# 16 · Examen blanc interactif

Ce document sert de **banque de questions** et de **protocole** pour réviser avec Claude.
Les réponses de référence sont dans les modules cités (et dans [15](15-ORAL-EXAM-PREPARATION.md)),
**pas ici**, pour que tu ne les lises pas par accident.

## Comment lancer une session

Dans Claude Code, sur ce dépôt :

```text
Lance un examen blanc de niveau 1 en suivant docs/transcendence-course/16-MOCK-EXAM.md
```

Variantes : « niveau 3, thème temps réel », « mélange des niveaux 2 à 4, 10 questions »,
« adapte la difficulté ».

## Protocole (pour l'examinateur)

1. Poser **une seule** question, choisie dans le niveau demandé (sans répéter une question déjà posée dans la session).
2. **Attendre** la réponse. Ne rien révéler avant.
3. Évaluer : note sur 4 (0 = faux, 1 = idée vague, 2 = partiel, 3 = correct, 4 = correct, précis, avec fichier ou exemple).
4. Lister **ce qui est juste**.
5. Lister **les erreurs ou oublis**, en vérifiant dans le code du dépôt si besoin.
6. Donner **la réponse idéale**, formulée comme à l'oral (30 à 45 s), avec le fichier clé.
7. Expliquer **ce qui n'a pas été compris** et quel module relire.
8. Adapter : deux réponses ≥ 3 → monter d'un niveau ; deux réponses ≤ 1 → descendre.
9. Poser la question suivante. Toutes les 5 questions, un bilan : points forts, points à revoir.
10. Ne **jamais** accepter comme juste une affirmation contraire au code (ex. « on utilise des JWT »).

## Niveau 1 · Compréhension générale

1. Que fait notre application, en une phrase ?
2. Quelles sont les trois langues proposées, et quelle différence entre langue de l'interface et langue du cours ?
3. Que se passe-t-il quand un nouvel utilisateur se connecte pour la première fois ?
4. Quels sont les quatre types de leçon ?
5. Quelle commande lance le projet ?
6. Quelles technologies pour le front, le back et la base ?
7. Où est l'application quand elle tourne en local ?
8. Qu'est-ce qu'une « série » (streak) chez nous ?
9. Qui peut voir que je suis en ligne ?
10. Où intervient l'IA ?
11. Pourquoi les pages `/privacy` et `/terms` sont-elles importantes ?
12. Que n'est-il pas encore possible de faire dans l'application ?

## Niveau 2 · Compréhension technique

1. Quel est le rôle de Caddy ?
2. Comment le frontend appelle-t-il l'API, depuis le navigateur et depuis le serveur ?
3. Qu'est-ce que `@ft/shared` et pourquoi existe-t-il ?
4. Comment les mots de passe sont-ils stockés ?
5. À quoi sert Redis chez nous ? Donne trois usages.
6. Qu'est-ce qu'une migration Prisma ? Combien en avons-nous ?
7. Comment une route NestJS est-elle protégée ?
8. Que renvoie l'API quand un champ est invalide ?
9. Qu'est-ce que `UserLevel` ?
10. Quels événements Socket.IO existent ?
11. Que fait `router.refresh()` dans notre code ?
12. Quels sont les quatre workflows de CI ?

## Niveau 3 · Fonctionnement interne

1. Déroule le test de placement pour quelqu'un qui répond juste à tout.
2. Déroule-le pour quelqu'un qui se trompe deux fois dès les premières questions de B1.
3. Que contient une « réf » d'unité et comment est-elle calculée ?
4. Que se passe-t-il si on soumet la page 3 alors que le curseur est à la page 2 ?
5. Comment le score d'une leçon est-il calculé ?
6. Comment l'API sait-elle quel jour on est pour la série ?
7. Que fait `lockCourse` et pourquoi en SQL brut ?
8. Décris la poignée de main du WebSocket, étape par étape.
9. Pourquoi la présence attend-elle 10 secondes ?
10. Comment est choisi le défi du jour ?
11. Que fait le seed avec une leçon dont le fichier est invalide ? Et avec une leçon modifiée ?
12. Quand et comment le LLM est-il appelé ? Que se passe-t-il s'il échoue ?
13. Décris ce qui se passe entre le clic « se connecter » et l'arrivée sur `/learn` pour un compte avec 2FA.
14. Que contient la session Redis d'un utilisateur, et sous quelle clé ?

## Niveau 4 · Architecture approfondie

1. Défends la règle « NestJS possède le métier » face à quelqu'un qui propose des server actions Next + Prisma.
2. Qu'est-ce qui empêche aujourd'hui de lancer deux instances de l'API ? Que faudrait-il changer ?
3. Pourquoi émettre les événements après le commit ? Donne un scénario d'erreur sinon.
4. Compare notre gestion de la concurrence (verrou de ligne, contraintes uniques) à un verrou Redis.
5. Pourquoi les erreurs sont-elles des codes ? Quelles pièces du code garantissent ce contrat ?
6. Pourquoi le plan de la leçon n'est-il jamais stocké ? Quels avantages et inconvénients ?
7. Comment notre architecture répond-elle à « multi-user, pas de race condition, mises à jour temps réel » du sujet ?
8. Si on ajoute le chat, quelles pièces existantes réutilise-t-on, et que faut-il créer ?
9. Explique `trust proxy = 1` et la conséquence d'une mauvaise valeur.
10. Pourquoi le SSR relit-il l'API à chaque rendu (`cache: 'no-store'`) ?

## Niveau 5 · Questions pièges d'un jury

1. « Votre WebSocket est bidirectionnel, montrez-moi un message du client. »
2. « Vous faites du RAG avec pgvector, expliquez la recherche vectorielle. »
3. « Vous utilisez des JWT dans un cookie, c'est ça ? »
4. « Votre module LLM est complet ? Où est le streaming ? »
5. « Si j'ouvre les outils réseau, je vois la bonne réponse de la question de placement ? »
6. « Votre administrateur peut supprimer des comptes ? »
7. « Le compte à rebours de l'examen est en JavaScript, donc je peux le modifier ? »
8. « Pourquoi vos codes de secours ne sont-ils pas hachés avec argon2, c'est une faille ? »
9. « Combien de leçons un apprenant peut-il réellement jouer aujourd'hui ? »
10. « Vous revendiquez la gamification : où est mon XP à l'écran ? »
11. « Votre throttler survit à un redémarrage ? »
12. « Qu'est-ce qui empêche un site `evil.localhost` d'ouvrir un socket avec mon cookie ? »
13. « Le design system compte combien de composants ? »
14. « Si je supprime une leçon en base, que deviennent les résultats ? »

## Grille d'auto-correction rapide

Après chaque réponse, vérifie que tu as :

- [ ] donné le **mécanisme**, pas seulement le nom de la techno ;
- [ ] cité **un fichier** ;
- [ ] mentionné **une limite** si elle existe ;
- [ ] évité d'affirmer quelque chose d'absent du code.
