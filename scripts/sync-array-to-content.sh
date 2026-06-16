#!/usr/bin/env bash
# @deprecated Use sync-api-to-content.mjs for hourly CI updates.
set -euo pipefail

ARRAY_FILE="${1:?array json file required}"
TARGET_DIR="${2:?target directory required}"
ID_FIELD="${3:-id}"

mkdir -p "$TARGET_DIR"

jq -c '.[]' "$ARRAY_FILE" | while read -r row; do
  id="$(echo "$row" | jq -r ".${ID_FIELD}")"
  echo "$row" | jq '.' > "${TARGET_DIR}/${id}.json"
done

new_ids="$(jq "[.[].${ID_FIELD}]" "$ARRAY_FILE")"
shopt -s nullglob
for file in "$TARGET_DIR"/*.json; do
  id="$(basename "$file" .json)"
  if ! echo "$new_ids" | jq -e --argjson id "$id" 'index($id) != null' >/dev/null; then
    rm "$file"
  fi
done
