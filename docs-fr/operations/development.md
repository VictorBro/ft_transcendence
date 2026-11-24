# Alias et fonctions du shell

Pour faciliter la vie des développeurs, des raccourcis et des fonctions sont définis dans [`.devcontainer/zshrc`](../../../.devcontainer/zshrc).

### `croot`

Te ramène à la racine du projet (`/workspace`) depuis n'importe quel dossier de ton shell.

### `prs`

Liste les PR récentes mergées dans `main` (jusqu'à 30) avec leur date de merge, le hash du commit, le numéro de PR, les issues fermées et le titre de la PR.

### `prc [count]`

Liste les PR mergées avec leur branche d'origine et déroule l'historique des commits de chaque PR.

- Par défaut : affiche les 3 dernières PR.
- Passe un nombre en argument pour en voir plus, par exemple `prc 5`.
- Passer `0` liste toutes les PR mergées.

### `switch <commit-hash> | switch main`

Te permet, depuis la branche `main`, d'aller sur un commit précis en mode `HEAD` détaché. C'est utile pour inspecter ou tester le code à un merge de PR donné.

- `switch <commit-hash>` : fait un checkout de `<commit-hash>` en mode `HEAD` détaché. **Autorisé seulement quand tu es sur la branche `main`**.
- `switch main` : revient sur la branche `main`. Autorisé depuis `main` ou depuis un `HEAD` détaché qui fait partie de l'historique de `main`.

# Le monitoring en développement

`make dev` laisse la stack de monitoring éteinte : ses sept services sont derrière le profil compose `monitoring`, pour qu'un laptop reste léger. Il supprime aussi les containers de monitoring qu'un `make` précédent a laissés tourner, et garde leurs données. `make`, `make up` et le serveur la lancent toujours. Le tableau complet est dans [operations/monitoring.md](monitoring.md).

### `make monitoring-up`

Lance la stack de dev plus Prometheus, Alertmanager, Grafana et les exporters. Il passe par `make dev`, donc les migrations, le seed et l'export du certificat tournent comme d'habitude, et le premier lancement écrit les deux secrets de Grafana dans `.env`.

- Grafana : `https://localhost/grafana` (avec `:<HTTPS_PORT>` quand ce n'est pas 443, comme sur une machine 42 : la commande affiche l'adresse), utilisateur `admin`, mot de passe donné par `grep GRAFANA_ADMIN_PASSWORD .env`. Depuis un terminal dans le devcontainer, utilise `https://caddy/grafana`.
- Sans lui, `/grafana` répond 502.
- `make down`, `make logs` et `make clean` incluent les containers de monitoring, par exemple `make logs SERVICES="prometheus alertmanager"`.

### Modifier une règle, un dashboard ou la config de Grafana

La config sous `infra/monitoring/` est intégrée dans trois petites images, pas montée en bind mount. Relance `make monitoring-up` après une modification : il les reconstruit en quelques secondes et recrée ce qui a changé.

- Règles : `./scripts/check-monitoring-config.sh` lance promtool et les tests unitaires des règles sans démarrer la stack.
- Dashboards : Grafana refuse d'enregistrer un dashboard provisionné, exprès. Modifie-le là-bas, puis Export, Export as JSON, modèle **Classic**, avec "Export the dashboard to use in another instance" **désactivé**. Remplace le fichier dans `infra/monitoring/grafana/dashboards/`, garde `"id": null` et l'uid, lance `make format`, puis `make monitoring-up`.
- Ajouter une métrique, un panel ou une alerte a chacun une courte checklist dans la section 7 de [operations/monitoring.md](monitoring.md).

### `make monitoring-check`

Chaque cible de scrape est up, chaque règle est saine, un Alertmanager est trouvé, et chaque série qu'une règle ou un panel lit est présente. Il vérifie pendant 150 s au maximum, donc il peut tourner juste après `make monitoring-up`. `make` le lance aussi.

### Atteindre Prometheus et les métriques brutes

Aucun port de monitoring n'est publié, même pas sur loopback. Depuis un terminal dans le devcontainer, chaque service répond par son nom :

```bash
curl -s http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
curl -s http://api:9464/metrics | grep '^ft_'
curl -s http://caddy:2020/metrics | grep caddy_http_requests_total
```

Depuis l'hôte, l'Explore de Grafana interroge Prometheus directement.
