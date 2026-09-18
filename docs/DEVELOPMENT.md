# Shell Aliases and Functions

For developer convenience, custom shortcuts and functions are defined in [`.devcontainer/zshrc`](file:///workspace/.devcontainer/zshrc).

### `croot`
Brings you back to the project root (`/workspace`) from any folder in your shell.

### `prs`
Lists recent PRs merged into `main` (up to 30) along with their merge date, commit hash, PR number, closed issue references, and PR title.

### `prc [count]`
Lists merged PRs with their originating branch and expands the commit history for each PR.
- Default: shows the last 3 PRs.
- Pass a number argument to view more, e.g., `prc 5`.
- Passing `0` lists merged PRs up to 50.
- Passing `0` lists all merged PRs.

### `switch <commit-hash> | switch main`
Allows you, from branch `main`, to switch into a specific commit in detached `HEAD` mode. This is useful to inspect or test the codebase at a certain PR merge.
- `switch <commit-hash>`: Checks out `<commit-hash>` in detached `HEAD` mode. **Only permitted when currently on branch `main`**.
- `switch main`: Returns to branch `main`. Permitted from `main` or from a detached `HEAD` that belongs to `main`'s history.
