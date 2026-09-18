# shell aliases and functions

For convenience of developer those functions are defined in /workspace/.devcontainer. See zshrc.

[croot]
: from any folder in your shell it brings you back to project root (/workspace)

[prs]
: gives a list of all prs merged into main with the respective reference commit

[prc]
: gives a list of prs merged into main and the respective sub commits. default is showing 3 prs, you can show more with additional argument, e.g. `prc 5`

[switch]
: allows you, from branch main, to switch into a certain commit on main. this is useful to checkout the changes on a certain pr merge. You can then also ask your favorite integrated AI: what changed with the current PR merge?

