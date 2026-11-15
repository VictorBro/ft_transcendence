# Diagramme · Flux des fonctionnalités principales

## Le parcours apprenant

```mermaid
flowchart LR
    signup["Inscription"] --> course["Choisir une langue<br/>+ objectif 10/30/60"]
    course --> lvl{"Niveau ?"}
    lvl -->|"test"| place["Placement adaptatif"]
    lvl -->|"choix direct"| set["PATCH /courses/:lang/level"]
    place --> today["Aujourd'hui : done · proposed · extra"]
    set --> today
    today --> play["Leçon : pages → examen → score"]
    play --> finish["applyFinish : meilleur score,<br/>objectif, série, XP, succès"]
    finish --> today
    finish -->|"niveau terminé"| next["LevelComplete → niveau suivant"]
```

## Placement (machine à états)

```mermaid
stateDiagram-v2
    [*] --> B1: POST /placement (lo=0, hi=5, niveau=2)
    state "Niveau courant" as cur
    B1 --> cur
    cur --> cur: bonne réponse ou 1re erreur<br/>(< 6 questions)
    cur --> Monter: 6 questions, ≤ 1 erreur
    cur --> Descendre: 2e erreur
    Monter --> Fin: niveau == hi-1 → hi
    Monter --> cur: lo = niveau+1<br/>niveau = milieu vers hi
    Descendre --> Fin: niveau == lo
    Descendre --> cur: hi = niveau<br/>niveau = milieu vers lo
    Fin --> [*]: setLevel + course#58;updated
```

## Une tentative de leçon

```mermaid
stateDiagram-v2
    [*] --> Page0: POST …/attempt (201)
    Page0 --> PageN: POST pages/0 (feedback)
    PageN --> PageN: POST pages/i == curseur
    PageN --> Stale: POST pages/j ≠ curseur → 409 attempt.stale
    Stale --> PageN
    PageN --> Examen: entrée sur page exam → deadline
    Examen --> Clos: dernière page (après deadline+2 s, unités vides)
    Clos --> [*]: results + applyFinish + course#58;updated
    Clos --> Page0: POST …/attempt (reprise, ancienne supprimée)
```

## Fin de leçon : ce qui est écrit, dans une seule transaction

```mermaid
flowchart TB
    lock["SELECT … FOR UPDATE UserLevel"] --> res["UPSERT LessonResult<br/>score = max(ancien, nouveau)"]
    res --> goal["meetGoal : COUNT résultats du jour ≥ cible ?<br/>→ streak, bestStreak, lastGoalDay"]
    goal --> award["award : XP (10 + amélioration, +20 objectif, +30 défi)<br/>UserAchievement (nouveaux)"]
    award --> att["UPDATE LessonAttempt (results, completedAt)"]
    att --> commit["COMMIT"]
    commit --> ev["toUser(course:updated)"]
```

## Amitié

```mermaid
stateDiagram-v2
    [*] --> Aucune
    Aucune --> Pending: A envoie (friend#58;request aux deux)
    Pending --> Accepted: B accepte, ou B envoie aussi (friend#58;accepted)
    Pending --> Aucune: B refuse / A annule (friend#58;removed)
    Accepted --> Aucune: l'un retire (friend#58;removed)
```
