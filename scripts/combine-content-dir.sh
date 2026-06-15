#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:?source directory required}"

shopt -s nullglob
files=("$SOURCE_DIR"/*.json)
if ((${#files[@]} == 0)); then
  echo '[]'
  exit 0
fi

jq -s 'add' "${files[@]}"
