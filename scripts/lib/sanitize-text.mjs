/**
 * Text cleanup shared by the sync scripts and the site build (src/utils/sanitizeText.ts
 * re-exports these), so both clean names and descriptions the same way.
 */

/**
 * Remove HTML and GW2 chat markup tags from catalog text.
 * @param {unknown} value
 * @returns {string}
 */
export function stripMarkup(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

/**
 * Decoration names from the API may include flavor text after a newline.
 * @param {unknown} name
 * @returns {string}
 */
export function sanitizeDisplayName(name) {
  const withoutTags = stripMarkup(name).trim();
  const firstLine = withoutTags
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ?? withoutTags;
}

/**
 * Sanitize longer text fields by removing markup only.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeText(value) {
  return stripMarkup(value).trim();
}
