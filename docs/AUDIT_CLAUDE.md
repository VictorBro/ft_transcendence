# Audit du projet — solidité et sécurité

> Revue complète : configuration, squelette, sécurité et documentation.
> Périmètre lu : `compose*.yml`, `Caddyfile`, workflows CI, `apps/api/src`,
> `apps/web`, `packages/shared`, `docs/`, `.gitignore`, schéma Prisma.

## Note globale : **17/20**

C'est un projet **solide et sécurisé**, très au-dessus de la moyenne d'un
ft_transcendence. Le niveau d'ingénierie est celui d'un vrai projet
professionnel.

---

## Ce qui est excellent

### Sécurité de l'authentification — 19/20

C'est la partie la plus impressionnante.

- **argon2id** avec la config OWASP (19 MiB, t=2, p=1) — [auth.service.ts:13-18](../apps/api/src/auth/auth.service.ts#L13-L18)
- **Défense contre l'énumération d'utilisateurs** : un `DUMMY_HASH` est vérifié
  quand l'email n'existe pas, pour égaliser le timing —
  [auth.service.ts:25](../apps/api/src/auth/auth.service.ts#L25). Ce détail-là,
  presque personne ne le fait.
- **Session fixation** correctement traitée : `regenerate()` sur chaque login
  *et* sur l'étape 2FA intermédiaire —
  [auth.controller.ts:52-82](../apps/api/src/auth/auth.controller.ts#L52-L82)
- **Guard privé par défaut** : `AuthGuard` est global, une route est protégée
  sauf `@Public()` explicite — c'est le bon sens de la valeur par défaut
  ([auth.guard.ts:9-12](../apps/api/src/auth/auth.guard.ts#L9-L12))
- **Revalidation en base à chaque requête** plutôt que de faire confiance à une
  copie en session : un compte supprimé perd l'accès immédiatement
- **2FA sérieux** : secret écrit mais inactif jusqu'à vérification (pas de
  lock-out), codes de récupération single-use consommés par `updateMany`
  atomique (pas de race), désactivation exigeant le mot de passe
- **Rate limiting réfléchi** : 5/min sur login et 2fa/verify, et le
  `IdentityThrottlerGuard` corrige un vrai bug d'architecture (tout le trafic
  arrivait comme une seule IP conteneur)

### Infrastructure — 17/20

Origine unique via Caddy (donc pas de CORS, cookies first-party), TLS partout,
`trust proxy` correct, secrets jamais commités (`.gitignore` propre, `gitleaks`
en CI sur l'historique complet), `SESSION_SECRET` obligatoire en prod via
`${VAR:?error}`, healthchecks partout, images non-root.

### Qualité du code — 19/20

Les commentaires expliquent *le pourquoi*, pas le quoi. Zod partagé entre front
et back (une seule source de vérité pour la validation). 161 tests, seuils de
couverture bloquants, CI hybride intelligente (tests dans Docker pour l'iso
prod), commitlint, e2e Playwright.

---

## Les vraies faiblesses

### 1. Pas de Content-Security-Policy

Le point le plus important. Le Caddyfile pose `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`... mais pas de CSP.
C'est le header qui compte le plus contre le XSS, et c'est aussi souvent demandé
en défense 42. Correction rapide dans [infra/caddy/Caddyfile](../infra/caddy/Caddyfile)
— attention, Next.js exige un nonce ou `'unsafe-inline'` sur les styles.

### 2. Swagger exposé en production

[app.setup.ts:68](../apps/api/src/app.setup.ts#L68) monte `/api/docs` sans
condition sur `NODE_ENV`. Ça donne à un attaquant la cartographie complète de
l'API. Une ligne à ajouter.

### 3. Aucune doc de sécurité

Un `grep` sur "security/OWASP/threat" dans `docs/` ne retourne **rien**. Toutes
ces décisions excellentes ne vivent que dans les commentaires du code. Un
évaluateur qui lit la doc ne les verra pas. Un `docs/SECURITY.md` récapitulant
le modèle de menace serait rentable, en défense comme en note.

### 4. README quasi vide

Deux lignes. Pour un projet de cette qualité c'est dommage.

### 5. Point mineur

Pas de rotation de session sur changement de mot de passe (mais il n'y a pas
encore de changement de mot de passe), et `sameSite: 'lax'` est correct ici,
`strict` serait plus fort.

---

## Bilan

| Domaine | Note |
| --- | --- |
| Sécurité auth/session | 19/20 |
| Infra & config | 17/20 |
| Qualité code & tests | 19/20 |
| Headers HTTP | 13/20 |
| Documentation | 12/20 |

Les trois premiers points sont corrigeables en une petite heure et te feraient
monter à **18-19/20**. Rien de ce que j'ai trouvé n'est une faille exploitable
en l'état — ce sont des durcissements manquants, pas des trous. La base est
saine.
