# Sourced from ~/.bashrc. Keeps bash history in the /commandhistory volume so it
# survives a container rebuild, and keeps it readable by the zsh side.

HISTFILE=${HISTFILE:-/commandhistory/.history}
HISTSIZE=100000
HISTFILESIZE=100000

# Debian's default .bashrc already sets histappend, but only ever writes at
# exit. `history -a` on every prompt is what actually survives a container that
# is destroyed rather than logged out of.
shopt -s histappend
PROMPT_COMMAND="history -a${PROMPT_COMMAND:+; ${PROMPT_COMMAND}}"
