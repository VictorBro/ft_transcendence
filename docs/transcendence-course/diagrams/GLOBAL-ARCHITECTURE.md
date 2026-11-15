# Diagramme · Architecture globale

Vérifié contre `compose.yml`, `compose.prod.yml` et `infra/caddy/Caddyfile` (commit `477b3d4`).

```mermaid
flowchart LR
    browser["Navigateur"]

    subgraph host["Hôte (make / VM)"]
        subgraph net["Réseau Docker « ft »"]
            caddy["caddy 2.11<br/>TLS · en-têtes · routage<br/><b>seul à publier 80/443</b>"]
            web["web · Next.js 16 :3000<br/>Server Components<br/>next-intl"]
            api["api · NestJS 11 :3001<br/>REST /api · Socket.IO /ws<br/>métriques :9464"]
            db[("db · PostgreSQL 18<br/>(image pgvector) :5432")]
            redis[("redis 8.10 :6379<br/>sess:* · user:*:eval* · presence:*")]
            subgraph mon["Supervision"]
                prom["prometheus :9090"]
                am["alertmanager :9093"]
                graf["grafana :3000"]
                exp["node · postgres · redis<br/>· blackbox exporters"]
            end
        end
    end

    gemini["API Gemini<br/>(si LLM_PROVIDER=gemini)"]
    discord["Webhook Discord"]

    browser -->|"HTTPS :443 (HTTP :80 → redirection)"| caddy
    caddy -->|"/api, /api/*"| api
    caddy -->|"/ws, /ws/*"| api
    caddy -->|"/grafana/* (sauf /grafana/metrics → 404)"| graf
    caddy -->|"tout le reste"| web
    web -->|"SSR : http://api:3001 + cookie recopié"| api
    api -->|"Prisma + adapter-pg"| db
    api -->|"sessions, placement, présence"| redis
    api -.->|"regarnissage, en arrière-plan"| gemini
    prom -.->|"scrape"| api
    prom -.->|"scrape :2020"| caddy
    prom -.-> exp
    graf --> prom
    prom --> am --> discord
```

## Lecture

1. Une seule entrée : Caddy. Tout le reste n'est joignable que par le réseau `ft`.
2. Même origine pour les pages, l'API et le WebSocket.
3. Next n'a aucun accès aux données : il passe par l'API, comme le navigateur.
4. Postgres = durable ; Redis = éphémère.
5. Le monitoring lit, il n'est jamais sur le chemin d'une requête utilisateur.
