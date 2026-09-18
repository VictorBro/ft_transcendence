#!/usr/bin/env bash

set -euo pipefail

count="${1:-3}"

if ! [[ "$count" =~ ^[0-9]+$ ]]; then
  echo "Usage: $(basename "$0") [number-of-prs]"
  echo "  default: 2"
  echo "  0:       all merged PRs"
  exit 1
fi

if (( count == 0 )); then
  gh_limit=1000000
else
  gh_limit="$count"
fi

rows=()
max_issue_width=0

# Fetch PR metadata first so we can determine the width of the issue column.
while IFS=$'\x1f' read -r date hash pr issues title; do
  if [[ -n "$issues" ]]; then
    issue_part="($issues)"
  else
    issue_part=""
  fi

  if (( ${#issue_part} > max_issue_width )); then
    max_issue_width=${#issue_part}
  fi

  rows+=(
    "$date"$'\x1f'"$hash"$'\x1f'"$pr"$'\x1f'"$issue_part"$'\x1f'"$title"
  )
done < <(
  gh pr list \
    --state merged \
    --limit "$gh_limit" \
    --json number,title,mergedAt,mergeCommit,closingIssuesReferences \
    --jq '.[] | [
      .mergedAt,
      .mergeCommit.oid[0:7],
      "#\(.number)",
      ([.closingIssuesReferences[].number] | map("#\(.)") | join(", ")),
      .title
    ] | join("\u001f")'
)

# Print each PR followed by its commits.
for row in "${rows[@]}"; do
  IFS=$'\x1f' read -r date hash pr issue_part title <<< "$row"

  printf "[%s]  %s  %-5s  %-*s  %s\n" \
    "$(TZ=Europe/Zurich date -d "$date" '+%m-%d %H:%M')" \
    "$hash" \
    "$pr" \
    "$max_issue_width" \
    "$issue_part" \
    "$title"

  pr_number="${pr#\#}"

  gh pr view "$pr_number" \
    --json commits \
    --jq '.commits[] | "    \(.oid[0:7])  \(.messageHeadline)"'

  echo
done
