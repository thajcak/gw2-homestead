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

/**
 * Lines the API repeats on most decorations. They say nothing about the item, so they are
 * neither searched nor shown.
 */
const BOILERPLATE_DESCRIPTION_LINES = [
  /^Crafted with Homesteading Mastery\.$/i,
  /^Requires Guild Wars 2: [^.]+\.$/i,
];

/** A decoration description with markup and boilerplate lines removed; empty when nothing is left. */
export function meaningfulDescription(value: string): string {
  return sanitizeText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !BOILERPLATE_DESCRIPTION_LINES.some((pattern) => pattern.test(line)))
    .join('\n');
}
