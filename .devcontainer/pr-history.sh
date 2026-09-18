#!/usr/bin/env bash

rows=()
max_issue_width=0

while IFS=$'\x1f' read -r date hash pr issues title; do
  if [ -n "$issues" ]; then
    issue_part="($issues)"
  else
    issue_part=""
  fi

  if (( ${#issue_part} > max_issue_width )); then
    max_issue_width=${#issue_part}
  fi

  rows+=("$date"$'\x1f'"$hash"$'\x1f'"$pr"$'\x1f'"$issue_part"$'\x1f'"$title")
done < <(
  gh pr list --state merged --limit 30 \
    --json number,title,mergedAt,mergeCommit,closingIssuesReferences \
    --jq '.[] | [
      .mergedAt,
      .mergeCommit.oid[0:7],
      "#\(.number)",
      ([.closingIssuesReferences[].number] | map("#\(.)") | join(", ")),
      .title
    ] | join("\u001f")'
)

for row in "${rows[@]}"; do
  IFS=$'\x1f' read -r date hash pr issue_part title <<< "$row"

  printf "[%s]  %s  %-5s  %-*s  %s\n" \
    "$(TZ=Europe/Zurich date -d "$date" '+%m-%d %H:%M')" \
    "$hash" \
    "$pr" \
    "$max_issue_width" \
    "$issue_part" \
    "$title"
done
