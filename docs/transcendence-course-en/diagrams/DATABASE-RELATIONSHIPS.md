# Diagram · Database relationships

Checked against `apps/api/prisma/schema.prisma` (13 migrations, the latest being `add_gamification`).

```mermaid
erDiagram
    User ||--o{ RecoveryCode : "Cascade"
    User ||--o{ UserLevel : "Cascade · unique (userId, lang)"
    User ||--o{ UserSeenQuestion : "Cascade · unique (userId, questionId)"
    User ||--o{ Friendship : "requester · Cascade"
    User ||--o{ Friendship : "addressee · Cascade"
    QuestionBank ||--o{ UserSeenQuestion : "Cascade"
    UserLevel ||--o{ LessonResult : "Cascade · PK (userLevelId, lessonId)"
    UserLevel ||--o{ LessonAttempt : "Cascade · unique (userLevelId, lessonId)"
    UserLevel ||--o{ UserAchievement : "Cascade · PK (userLevelId, code)"
    Lesson ||--o{ LessonResult : "Restrict"
    Lesson ||--o{ LessonAttempt : "Cascade"

    User {
        uuid id PK
        string email UK
        string displayName UK
        string passwordHash
        string avatarUrl
        Locale locale
        Role role
        string timeZone
        date lastActiveDay
        string totpSecret
        datetime totpEnabledAt
        Language activeLang
    }
    RecoveryCode {
        uuid id PK
        uuid userId FK
        string codeHash UK
        datetime usedAt
    }
    UserLevel {
        uuid id PK
        uuid userId FK
        Language lang
        Level level
        int dailyGoal
        int streak
        int bestStreak
        date lastGoalDay
        int xp
        date lastChallengeDay
        string lastChallengeCode
        int challengesDone
    }
    Lesson {
        string id PK
        Language lang
        Level level
        int position
        LessonKind kind
        Topic topic
        Theme theme
        string title
        string summary
        json brief
        json content
        bool ready
    }
    LessonResult {
        uuid userLevelId PK
        string lessonId PK
        int score
        date day
        datetime finishedAt
    }
    LessonAttempt {
        uuid id PK
        uuid userLevelId FK
        string lessonId FK
        Locale motherTongue
        bytes secret
        int page
        datetime deadline
        json answers
        datetime completedAt
        json results
    }
    UserAchievement {
        uuid userLevelId PK
        string code PK
        date day
        datetime earnedAt
    }
    QuestionBank {
        uuid id PK
        string sourceId UK
        Language lang
        Level level
        Topic topic
        QuestionCategory category
        string question
        string answer
        int timeLimitS
    }
    UserSeenQuestion {
        uuid id PK
        uuid userId FK
        uuid questionId FK
    }
    Friendship {
        string pairKey PK
        uuid requesterId FK
        uuid addresseeId FK
        FriendshipStatus status
    }
```

## Examples

- Lina (`User`) is learning German and French: **2 `UserLevel` rows** (`de`, `fr`).
- She finished `de-verb-sein-present` twice (60 then 85): **1 `LessonResult` row**, score 85.
- She replays the lesson: her finished `LessonAttempt` is **deleted** and a new one is created.
- Lina and Bob are friends: **1 `Friendship` row**, `pairKey = "<smaller uuid>:<larger>"`, `status = accepted`.
