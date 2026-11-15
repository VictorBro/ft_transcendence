# 16 · Interactive mock exam

This document is a **question bank** and a **protocol** for revising with Claude.
The reference answers are in the cited modules (and in [15](15-ORAL-EXAM-PREPARATION.md)),
**not here**, so that you do not read them by accident.

## How to start a session

In Claude Code, on this repository:

```text
Run a level 1 mock exam following docs/transcendence-course-en/16-MOCK-EXAM.md
```

Variants: "level 3, real-time topic", "mix of levels 2 to 4, 10 questions",
"adapt the difficulty".

## Protocol (for the examiner)

1. Ask **a single** question, chosen from the requested level (without repeating a question already asked in the session).
2. **Wait** for the answer. Reveal nothing beforehand.
3. Evaluate: score out of 4 (0 = wrong, 1 = vague idea, 2 = partial, 3 = correct, 4 = correct, precise, with a file or example).
4. List **what is right**.
5. List **the errors or omissions**, checking in the repository code if needed.
6. Give **the ideal answer**, phrased as for the oral (30 to 45 s), with the key file.
7. Explain **what was not understood** and which module to reread.
8. Adapt: two answers ≥ 3 → go up a level; two answers ≤ 1 → go down.
9. Ask the next question. Every 5 questions, a review: strengths, points to revisit.
10. **Never** accept as correct a claim that contradicts the code (e.g. "we use JWTs").

## Level 1 · General understanding

1. What does our application do, in one sentence?
2. What are the three languages offered, and what is the difference between the interface language and the course language?
3. What happens when a new user logs in for the first time?
4. What are the four lesson types?
5. Which command starts the project?
6. Which technologies for the front end, the back end and the database?
7. Where is the application when it runs locally?
8. What is a "streak" for us?
9. Who can see that I am online?
10. Where does AI come in?
11. Why are the `/privacy` and `/terms` pages important?
12. What is not yet possible to do in the application?

## Level 2 · Technical understanding

1. What is the role of Caddy?
2. How does the frontend call the API, from the browser and from the server?
3. What is `@ft/shared` and why does it exist?
4. How are passwords stored?
5. What do we use Redis for? Give three uses.
6. What is a Prisma migration? How many do we have?
7. How is a NestJS route protected?
8. What does the API return when a field is invalid?
9. What is `UserLevel`?
10. Which Socket.IO events exist?
11. What does `router.refresh()` do in our code?
12. What are the four CI workflows?

## Level 3 · Internal workings

1. Walk through the placement test for someone who answers everything correctly.
2. Walk through it for someone who gets it wrong twice in the very first B1 questions.
3. What does a unit "ref" contain and how is it computed?
4. What happens if you submit page 3 while the cursor is on page 2?
5. How is a lesson's score computed?
6. How does the API know what day it is for the streak?
7. What does `lockCourse` do and why in raw SQL?
8. Describe the WebSocket handshake, step by step.
9. Why does presence wait 10 seconds?
10. How is the daily challenge chosen?
11. What does the seed do with a lesson whose file is invalid? And with a modified lesson?
12. When and how is the LLM called? What happens if it fails?
13. Describe what happens between the "log in" click and arriving on `/learn` for an account with 2FA.
14. What does a user's Redis session contain, and under which key?

## Level 4 · In-depth architecture

1. Defend the "NestJS owns the business logic" rule against someone who proposes Next server actions + Prisma.
2. What currently prevents running two instances of the API? What would need to change?
3. Why emit events after the commit? Give an error scenario otherwise.
4. Compare our concurrency handling (row lock, unique constraints) to a Redis lock.
5. Why are errors codes? Which pieces of code guarantee this contract?
6. Why is the lesson plan never stored? What are the advantages and drawbacks?
7. How does our architecture address the subject's "multi-user, no race condition, real-time updates"?
8. If we add chat, which existing pieces do we reuse, and what needs to be created?
9. Explain `trust proxy = 1` and the consequence of a wrong value.
10. Why does SSR re-read the API on every render (`cache: 'no-store'`)?

## Level 5 · Jury trick questions

1. "Your WebSocket is bidirectional, show me a message from the client."
2. "You do RAG with pgvector, explain vector search."
3. "You use JWTs in a cookie, right?"
4. "Is your LLM module complete? Where is the streaming?"
5. "If I open the network tools, do I see the correct answer to the placement question?"
6. "Can your administrator delete accounts?"
7. "The exam countdown is in JavaScript, so I can modify it?"
8. "Why aren't your backup codes hashed with argon2, is that a vulnerability?"
9. "How many lessons can a learner actually play today?"
10. "You claim gamification: where is my XP on screen?"
11. "Does your throttler survive a restart?"
12. "What prevents an `evil.localhost` site from opening a socket with my cookie?"
13. "How many components does the design system have?"
14. "If I delete a lesson in the database, what happens to the results?"

## Quick self-grading grid

After each answer, check that you have:

- [ ] given the **mechanism**, not just the name of the technology;
- [ ] cited **a file**;
- [ ] mentioned **a limitation** if there is one;
- [ ] avoided claiming something absent from the code.
