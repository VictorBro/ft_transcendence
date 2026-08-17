# Audit DeepSeek

J'ai tout lu: config, compose, Dockerfiles, Caddyfile, docs, CI, auth, sessions, throttling, schémas, tests. Et j'ai exécuté les tests moi-même: 28/28 (@ft/shared) et 58/58 (apps/api) passent. Verdict:

**NOTE GLOBALE: 17.5/20** — c'est le squelette le plus solide que j'ai audité sur un projet 42. Pas "prometteur", carrément professionnel.

---

## LES POINTS FORTS (rares à ce niveau)

### Architecture — 20/20

- Un seul point d'entrée: Caddy termine le TLS, `/api/*` -> NestJS, `/ws/*` -> socket, le reste -> Next. Une seule origine => zéro CORS, cookie de session first-party.
- Seul caddy publie des ports. DB et Redis inaccessibles de l'extérieur (loopback-only en dev, documenté).
- `trust proxy = 1` (pas `true`), et le commentaire explique pourquoi c'est critique pour le throttling.
- One rule: NestJS possède toute la logique métier, Next ne fait que de la présentation. Réponse de soutenance en une phrase.

### Sécurité — 17/20 (le -1,5 est surtout le CSP, voir plus bas)

- argon2id avec les paramètres OWASP (19 MiB, 2 itérations), + hash factice pour égaliser les timings de login (ne fuit pas quels emails existent).
- Sessions: cookie httpOnly + secure en prod + sameSite=lax, régénération de session à chaque login (anti-fixation), relecture du user en DB à chaque requête (un compte supprimé perd l'accès immédiatement).
- Guard global default-deny: une route est privée sauf `@Public` explicite. "L'inverse est comme les endpoints finissent exposés par omission."
- 2FA TOTP complet: enrolment sans verrouillage, recovery codes single-use (digest SHA-256, consommation atomique `updateMany`), mot de passe re-demandé pour désactiver le facteur.
- Throttling par identité: 5/min login, 5/min 2fa, 10/min signup, 100/min anon, 600/min session. Le guard personnalisé corrige un vrai piège (tout le trafic arrive de l'IP du conteneur derrière Caddy — ils ont documenté le raisonnement entier).
- Images Docker: USER node non-root, tini, HEALTHCHECK, et suppression de npm/corepack de l'image prod pour éliminer toute une classe de CVE (Trivy 0 finding OS, vérifié et documenté).
- Secrets: prod refuse de démarrer sans SESSION_SECRET explicite (pas de fallback dév), `.env.example` sans vraies valeurs, CI qui refuse tout dotenv commité.

### CI & hygiène — 19/20

gitleaks sur l'historique complet, commitlint, drift `.env.example`, `prisma migrate diff` contre shadow DB, assert de la version TypeScript (piège TS7 documenté), tests unitaires + supertest contre vraie Postgres+Redis, e2e Playwright sur les images de prod avec console gate (critère d'échec du sujet), Trivy publié au Security tab, builds multi-arch natifs (pas de QEMU). Ce niveau de CI sur un 42, c'est hors norme.

### Doc — 19/20

`ARCHITECTURE.md` et `VERSIONS.md` sont exceptionnels: chaque décision a son "pourquoi", les pièges de versions sont traqués (TypeScript 7 casse NestJS, pnpm 11 supprime allowlist, Prisma 7 rust-free nécessite un adapter, Node 26 LTS arrive en octobre). Le README de 3 lignes est le seul reproche, cosmétique.

---

## LES POINTS FAIBLES (mineurs, dans l'ordre)

1. **Pas de Content-Security-Policy.** Le Caddyfile met nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, mais pas de CSP. Pour un Next.js ça se met via `headers()` dans next.config. C'est le trou le plus notable — avec le XSS c'est la première ligne de défense. (moyen)
2. **Pas de HSTS** — délibéré et documenté (localhost), mais à activer dès qu'il y a un vrai domaine.
3. **Pas de vérification email au signup**: compte actif immédiatement. Acceptable pour le sujet, mitigé par le rate limit, mais c'est le point qu'un examinateur pointilleux relèvera.
4. **Pas de CSRF token explicite** — défendable (sameSite=lax + JSON + pas de CORS), mais pas documenté comme posture.
5. **Pas de Dependabot/Renovate** — compensé par les pins exacts + Trivy + `VERSIONS.md`.
6. **Le websocket n'est pas encore câblé dans app.module** (seuls les events sont dans shared) et le LLM est en mode fixture — normal, projet en cours. Le risque c'est que les prochaines features (chat, matchmaking, IA) ne suivent pas le même standard.

---

## EN CLAIR

La sécurité est pensée comme un système, pas saupoudrée: chaque choix (`trust proxy=1`, throttler par identité, régénération de session, relecture DB par requête) résout un vrai vecteur d'attaque et le commentaire explique lequel. J'ai cherché des secrets dans l'historique git, des fallbacks de secrets en prod, des routes sans auth, des validations manquantes: rien. Le seul vrai manque est le CSP.

Si tu veux, je peux ajouter le CSP (via `next.config.ts` ou Caddyfile, selon ta préférence pour Next avec nonces) — c'est le seul chantier sécurité qui manque avant la soutenance.
