#!/bin/sh
#
# Rewrites a .env in its template's order and comments, and keeps every value.
#
#   scripts/align-env.sh [ENV_FILE] [TEMPLATE]    defaults: .env .env.example
#
# `make env-file` and .devcontainer/initialize.sh append each key the template
# gains at the end of .env, and a .env keeps the comments of the day it was
# copied. This puts every key back where the template has it:
#
#   - a key both files set keeps ENV_FILE's line, byte for byte;
#   - a key only the template sets comes in with the template's default;
#   - a `# KEY=` line of the template becomes active when ENV_FILE sets KEY;
#   - a key the template does not know stays, at the end under
#     "# Not in the template", and its name is reported on stderr.
#
# Comments come from the template; those written in ENV_FILE are dropped.
# Values never reach the terminal: they go from one file to the other and
# nowhere else, and every message names keys only. The previous file stays as
# ENV_FILE.bak, readable by its owner only, and holds every secret: delete it
# once the stack runs. The new file keeps ENV_FILE's mode, and a second run
# changes nothing.
#
# It refuses, and writes nothing, when it cannot be sure to keep a value: a key
# set twice (only the last counts, so which one to keep is your call), or a
# value that spans lines.
#
# POSIX sh and awk on purpose: a server has neither a checkout nor node. Copy
# the script and the template next to its .env, then: sh align-env.sh
set -eu

env_file="${1:-.env}"
template="${2:-.env.example}"

say() { printf 'align-env: %s\n' "$*"; }
die() {
  printf 'align-env: %s\n' "$*" >&2
  exit 1
}

[ -f "$template" ] || die "no $template to align with"
[ -f "$env_file" ] || die "no $env_file to align: copy $template to it first"
[ "$env_file" != "$template" ] || die "$env_file is the template itself"

# An operand like a=b is an assignment to awk, not a file: anchor relative paths.
case "$env_file" in /*) env_in="$env_file" ;; *) env_in="./$env_file" ;; esac
case "$template" in /*) template_in="$template" ;; *) template_in="./$template" ;; esac

# Everything written below holds secrets, so nothing is readable by others.
umask 077
tmp="$env_file.align.$$"
names="$env_file.align-names.$$"
trap 'rm -f "$tmp" "$names"' EXIT
trap 'rm -f "$tmp" "$names"; exit 1' HUP INT TERM

# How compose reads a line: an optional `export`, then KEY=. Sets key and val.
# Shared by both programs below.
PARSE='
function parse(s,   k) {
  key = ""
  val = ""
  if (!match(s, /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*=/)) return 0
  k = substr(s, 1, RLENGTH - 1)
  val = substr(s, RLENGTH + 1)
  sub(/^[ \t]*/, "", k)
  sub(/^export[ \t]+/, "", k)
  key = k
  return 1
}'

# Lines this cannot carry over safely, by file and line number, never content.
check() {
  awk -v dups="$2" "$PARSE"'
    !parse($0) {
      if ($0 !~ /^[ \t]*(#.*)?\r?$/) print FILENAME ":" FNR ": neither KEY=value, a comment nor a blank line"
      next
    }
    {
      v = val
      sub(/^[ \t]+/, "", v)
      q = substr(v, 1, 1)
      if ((q == "\"" || q == "\047") && index(substr(v, 2), q) == 0)
        print FILENAME ":" FNR ": " key " opens a quote that this line does not close"
      if (dups && (key in seen)) print FILENAME ":" FNR ": " key " is set again (first on line " seen[key] ")"
      if (!(key in seen)) seen[key] = FNR
    }
  ' "$1"
}

problems="$(check "$env_in" 1; check "$template_in" 0)"
if [ -n "$problems" ]; then
  printf '%s\n' "$problems" >&2
  die "$env_file left as it was"
fi

# cp -p first, so the new file has ENV_FILE's mode before a secret lands in it.
cp -p "$env_file" "$tmp"
ALIGN_NAMES="$names" awk "$PARSE"'
  phase == 1 {
    if (parse($0)) {
      if (!(key in line)) order[++n] = key
      line[key] = $0
    }
    next
  }
  parse($0) {
    known[key] = 1
    # A second template line for a key already written would override it.
    if (key in done) next
    done[key] = 1
    if (key in line) print line[key]
    else {
      print
      added = added " " key
    }
    next
  }
  match($0, /^# ?[A-Za-z_][A-Za-z0-9_]*=/) {
    k = substr($0, 2, RLENGTH - 2)
    sub(/^ /, "", k)
    known[k] = 1
    if ((k in line) && !(k in done)) {
      done[k] = 1
      print line[k]
      next
    }
  }
  { print }
  END {
    out = ENVIRON["ALIGN_NAMES"]
    for (i = 1; i <= n; i++) {
      k = order[i]
      if (k in known) continue
      if (unknown == "") {
        print ""
        print "# Not in the template. Kept by scripts/align-env.sh: delete what nothing reads."
      }
      print line[k]
      unknown = unknown " " k
    }
    printf "added%s\nunknown%s\n", added, unknown > out
  }
' phase=1 "$env_in" phase=2 "$template_in" >"$tmp"

added="$(sed -n 's/^added//p' "$names")"
unknown="$(sed -n 's/^unknown//p' "$names")"

if cmp -s "$tmp" "$env_file"; then
  say "$env_file already follows $template, nothing to do"
  exit 0
fi

rm -f "$env_file.bak"
cp "$env_file" "$env_file.bak"
# A symlinked .env is written through, to stay the link it was.
if [ -L "$env_file" ]; then
  cat "$tmp" >"$env_file"
else
  mv -f "$tmp" "$env_file"
fi

say "$env_file now follows $template; the previous file is $env_file.bak, secrets included"
[ -z "$added" ] || say "new from the template, with its default:$added"
[ -z "$unknown" ] || printf 'align-env: not in %s, kept at the end:%s\n' "$template" "$unknown" >&2
exit 0
