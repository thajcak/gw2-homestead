#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/src/content/changelog}"
TODAY_UTC=$(date -u +%F)

DECORATIONS_DIR="src/content/decorations"
CATEGORIES_DIR="src/content/categories"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

EVENTS_FILE="$WORK_DIR/events.jsonl"
: > "$EVENTS_FILE"

empty_array_file="$WORK_DIR/empty.json"
echo '[]' > "$empty_array_file"

combine_collection_at_commit() {
  local commit="$1"
  local dir="$2"
  local output_file="$3"
  local extract_dir="$WORK_DIR/extract_${dir//\//_}_${commit}"

  rm -rf "$extract_dir"
  mkdir -p "$extract_dir"

  local files
  files="$(git ls-tree -r --name-only "$commit" "$dir" 2>/dev/null | grep '\.json$' || true)"
  if [ -z "$files" ]; then
    cp "$empty_array_file" "$output_file"
    return
  fi

  while IFS= read -r file_path; do
    [ -n "$file_path" ] || continue
    git show "${commit}:${file_path}" > "${extract_dir}/$(basename "$file_path")"
  done <<< "$files"

  if compgen -G "${extract_dir}/*.json" > /dev/null; then
    jq -s 'add' "${extract_dir}"/*.json > "$output_file"
  else
    cp "$empty_array_file" "$output_file"
  fi
}

emit_events_for_array() {
  local day="$1"
  local old_file="$2"
  local new_file="$3"
  local include_image_updates="$4"
  local old_categories_file="${5:-$empty_array_file}"
  local new_categories_file="${6:-$empty_array_file}"

  jq -c --arg day "$day" --slurpfile old "$old_file" --slurpfile oldCategories "$old_categories_file" --slurpfile newCategories "$new_categories_file" '
    def validItems:
      if type == "array" then
        map(select(type == "object" and (.id != null) and (.name != null)))
      else
        []
      end;
    ($old[0] | validItems | map({key:(.id|tostring), value:.}) | from_entries) as $oldById
    | (
        (
          (if ($oldCategories[0] | type) == "array" then $oldCategories[0] else [] end)
          + (if ($newCategories[0] | type) == "array" then $newCategories[0] else [] end)
        )
        | validItems
        | map({key:(.id|tostring), value:.name})
        | from_entries
      ) as $categoryNames
    | (validItems)[]
    | . as $newItem
    | ($oldById[$newItem.id|tostring]) as $oldItem
    | if $oldItem == null then
        {day:$day, id:$newItem.id, type:"New Item", name:$newItem.name}
      elif ($newItem | del(.thumbnail, .original, .recipe)) != ($oldItem | del(.thumbnail, .original, .recipe)) then
        (($oldItem.description // "") | tostring) as $oldDescription
        | (($newItem.description // "") | tostring) as $newDescription
        | ([
            if (($oldItem.name // null) != ($newItem.name // null)) then
              {
                field: "name",
                before: ($oldItem.name // null),
                after: ($newItem.name // null)
              }
            else empty end,
            if (($oldItem.max_count // null) != ($newItem.max_count // null)) then
              {
                field: "max_count",
                before: ($oldItem.max_count // null),
                after: ($newItem.max_count // null)
              }
            else empty end,
            if (($oldDescription | length) == 0 and ($newDescription | length) > 0) then
              {
                field: "description",
                detail: "Added Description",
                before: "",
                after: $newDescription
              }
            elif (($oldDescription | length) > 0 and ($newDescription | length) == 0) then
              {
                field: "description",
                detail: "Removed Description",
                before: $oldDescription,
                after: ""
              }
            elif ($oldDescription != $newDescription) then
              {
                field: "description",
                before: $oldDescription,
                after: $newDescription
              }
            else empty end
          ]
          + (
            (($newItem.categories // []) - ($oldItem.categories // []))
            | map({
                field: "categories",
                detail: ((($categoryNames[(.|tostring)] // ("Category " + (. | tostring))) | tostring) + " was added"),
                before: null,
                after: .
              })
          )
          + (
            (($oldItem.categories // []) - ($newItem.categories // []))
            | map({
                field: "categories",
                detail: ((($categoryNames[(.|tostring)] // ("Category " + (. | tostring))) | tostring) + " was removed"),
                before: .,
                after: null
              })
          )
        ) as $changes
        | if ($changes | length) > 0 then
            {day:$day, id:$newItem.id, type:"Item Update", name:$newItem.name, changes:$changes}
          else
            empty
          end
      else
        empty
      end
  ' "$new_file" >> "$EVENTS_FILE"

  jq -c --arg day "$day" --slurpfile new "$new_file" '
    def validItems:
      if type == "array" then
        map(select(type == "object" and (.id != null) and (.name != null)))
      else
        []
      end;
    ($new[0] | validItems | map({key:(.id|tostring), value:.}) | from_entries) as $newById
    | (validItems)[]
    | . as $oldItem
    | ($newById[$oldItem.id|tostring]) as $newItem
    | if $newItem == null then
        {day:$day, id:$oldItem.id, type:"Item Removed", name:$oldItem.name}
      else
        empty
      end
  ' "$old_file" >> "$EVENTS_FILE"

  if [[ "$include_image_updates" == "true" ]]; then
    jq -c --arg day "$day" --slurpfile old "$old_file" '
      def validItems:
        if type == "array" then
          map(select(type == "object" and (.id != null) and (.name != null)))
        else
          []
        end;
      ($old[0] | validItems | map({key:(.id|tostring), value:.}) | from_entries) as $oldById
      | (validItems)[]
      | . as $newItem
      | ($oldById[$newItem.id|tostring]) as $oldItem
      | select($oldItem != null)
      | select((($newItem.thumbnail // null) != ($oldItem.thumbnail // null)) or (($newItem.original // null) != ($oldItem.original // null)))
      | {day:$day, id:$newItem.id, type:"Image Update", name:$newItem.name}
    ' "$new_file" >> "$EVENTS_FILE"
    jq -c --arg day "$day" --arg today "$TODAY_UTC" --slurpfile old "$old_file" '
      def validItems:
        if type == "array" then
          map(select(type == "object" and (.id != null) and (.name != null)))
        else
          []
        end;
      def recipeEmpty: . as $x | ($x == null or $x == {});
      ($old[0] | validItems | map({key:(.id|tostring), value:.}) | from_entries) as $oldById
      | (validItems)[]
      | . as $newItem
      | ($oldById[$newItem.id|tostring]) as $oldItem
      | select($oldItem != null)
      | ($oldItem.recipe // null) as $or
      | ($newItem.recipe // null) as $nr
      | if ($or | recipeEmpty | not) and (($or | tojson) != ($nr | tojson)) then
          {day:$day, id:$newItem.id, type:"Recipe Updated", name:$newItem.name}
        elif ($or | recipeEmpty) and ($nr | recipeEmpty | not) and ($day != $today) then
          {day:$day, id:$newItem.id, type:"Recipe Added", name:$newItem.name}
        else
          empty
        end
    ' "$new_file" >> "$EVENTS_FILE"
  fi
}

while IFS='|' read -r commit epoch; do
  day="$(date -u -r "$epoch" +%F)"
  parent="$(git rev-list --parents -n 1 "$commit" | awk '{print $2}')"

  old_decorations="$WORK_DIR/old_decorations.json"
  new_decorations="$WORK_DIR/new_decorations.json"
  old_categories="$WORK_DIR/old_categories.json"
  new_categories="$WORK_DIR/new_categories.json"

  if [[ -n "$parent" ]]; then
    combine_collection_at_commit "$parent" "$DECORATIONS_DIR" "$old_decorations"
    combine_collection_at_commit "$parent" "$CATEGORIES_DIR" "$old_categories"
  else
    cp "$empty_array_file" "$old_decorations"
    cp "$empty_array_file" "$old_categories"
  fi

  combine_collection_at_commit "$commit" "$DECORATIONS_DIR" "$new_decorations"
  combine_collection_at_commit "$commit" "$CATEGORIES_DIR" "$new_categories"

  emit_events_for_array "$day" "$old_decorations" "$new_decorations" "true" "$old_categories" "$new_categories"
  emit_events_for_array "$day" "$old_categories" "$new_categories" "false" "$old_categories" "$new_categories"
done < <(git log --reverse --format='%H|%ct' -- "$DECORATIONS_DIR" "$CATEGORIES_DIR")

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/*.json

if [[ -s "$EVENTS_FILE" ]]; then
  jq -s '
    map(select(.id != null and .name != null and .name != "" and .type != null and .type != ""))
    | map(
        {id, type, name}
        + (if (.changes? != null and (.changes | length) > 0) then {changes: .changes} else {} end)
        + {day}
      )
    | group_by(.day)
    | map({
        day: .[0].day,
        entries: (map(del(.day)) | unique_by(.id, .type, .name, ((.changes // []) | tostring)))
      })
    | .[]
  ' "$EVENTS_FILE" | while read -r day_object; do
    day="$(echo "$day_object" | jq -r '.day')"
    echo "$day_object" | jq '.' > "${OUTPUT_DIR}/${day}.json"
  done
else
  echo "No changelog events found in git history."
fi

echo "Generated changelog day files in $OUTPUT_DIR"
