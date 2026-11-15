# Diagram · Global architecture

Checked against `compose.yml`, `compose.prod.yml` and `infra/caddy/Caddyfile` (commit `477b3d4`).

```mermaid
flowchart LR
    browser["Browser"]

    subgraph host["Host (make / VM)"]
        subgraph net["Docker network “ft”"]
            caddy["caddy 2.11<br/>TLS · headers · routing<br/><b>the only one publishing 80/443</b>"]
            web["web · Next.js 16 :3000<br/>Server Components<br/>next-intl"]
            api["api · NestJS 11 :3001<br/>REST /api · Socket.IO /ws<br/>metrics :9464"]
            db[("db · PostgreSQL 18<br/>(pgvector image) :5432")]
            redis[("redis 8.10 :6379<br/>sess:* · user:*:eval* · presence:*")]
            subgraph mon["Monitoring"]
                prom["prometheus :9090"]
                am["alertmanager :9093"]
                graf["grafana :3000"]
                exp["node · postgres · redis<br/>· blackbox exporters"]
            end
        end
    end

    gemini["Gemini API<br/>(if LLM_PROVIDER=gemini)"]
    discord["Discord webhook"]

    browser -->|"HTTPS :443 (HTTP :80 → redirect)"| caddy
    caddy -->|"/api, /api/*"| api
    caddy -->|"/ws, /ws/*"| api
    caddy -->|"/grafana/* (except /grafana/metrics → 404)"| graf
    caddy -->|"everything else"| web
    web -->|"SSR : http://api:3001 + copied cookie"| api
    api -->|"Prisma + adapter-pg"| db
    api -->|"sessions, placement, presence"| redis
    api -.->|"replenishment, in the background"| gemini
    prom -.->|"scrape"| api
    prom -.->|"scrape :2020"| caddy
    prom -.-> exp
    graf --> prom
    prom --> am --> discord
```

## Reading

1. A single entry point: Caddy. Everything else is only reachable through the `ft` network.
2. Same origin for the pages, the API and the WebSocket.
3. Next has no access to the data: it goes through the API, like the browser.
4. Postgres = durable; Redis = ephemeral.
5. Monitoring reads, it is never on the path of a user request.
