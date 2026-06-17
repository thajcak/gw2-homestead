/** Remove HTML and GW2 chat markup tags from catalog text. */
export function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** Decoration names from the API may include flavor text after a newline. */
export function sanitizeDisplayName(name: string): string {
  const withoutTags = stripMarkup(name).trim();
  const firstLine = withoutTags
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ?? withoutTags;
}

/** Sanitize longer text fields by removing markup only. */
export function sanitizeText(value: string): string {
  return stripMarkup(value).trim();
}
