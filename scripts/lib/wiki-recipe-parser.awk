function strip_wiki(s) {
  gsub(/\[\[[^|\]]*\|([^\]]+)\]\]/, "\\1", s)
  gsub(/\[\[([^\]]+)\]\]/, "\\1", s)
  return s
}
function extract_block(s,   lower, pos, i, n, depth, c2) {
  lower = tolower(s)
  pos = index(lower, "{{recipe")
  if (!pos) return ""
  n = length(s)
  i = pos
  depth = 0
  while (i <= n) {
    c2 = substr(s, i, 2)
    if (c2 == "{{") { depth++; i += 2; continue }
    if (c2 == "}}") { depth--; i += 2; if (depth == 0) return substr(s, pos, i - pos); continue }
    i++
  }
  return ""
}
function parse_ing_line(slot, val,   qty, item) {
  val = strip_wiki(val)
  if (match(val, /^[0-9]+[[:space:]]+/)) {
    qty = substr(val, RSTART, RLENGTH)
    gsub(/[[:space:]]+$/, "", qty)
    item = substr(val, RSTART + RLENGTH)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", item)
  } else {
    qty = ""
    item = val
  }
  printf "ING\t%d\t%s\t%s\n", slot, qty, item
}
{ content = content $0 "\n" }
END {
  block = extract_block(content)
  if (block == "") { exit 0 }
  sub(/^\{\{[Rr]ecipe[[:space:]]*/, "", block)
  sub(/\}\}[[:space:]]*$/, "", block)
  inner = block
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", inner)
  if (substr(inner, 1, 1) != "|") inner = "|" inner
  nlines = split(inner, L, "\n")
  delete params
  for (li = 1; li <= nlines; li++) {
    line = L[li]
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
    if (line ~ /^\|/) {
      line = substr(line, 2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      eq = index(line, "=")
      if (eq > 0) {
        key = substr(line, 1, eq - 1)
        val = substr(line, eq + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        key = tolower(key)
        gsub(/ /, "_", key)
        params[key] = val
      }
    }
  }
  has = 0
  for (k in params) {
    if (k ~ /^ingredient[1-4]$/) continue
    has = 1
    printf "PAIR\t%s\t%s\n", k, strip_wiki(params[k])
  }
  for (s = 1; s <= 4; s++) {
    ik = "ingredient" s
    if ((ik in params) && params[ik] != "") {
      has = 1
      parse_ing_line(s, params[ik])
    }
  }
  if (!has) exit 0
}
