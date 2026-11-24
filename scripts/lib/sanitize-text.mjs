/**
 * Text cleanup shared by the sync scripts and the site build (src/utils/sanitizeText.ts
 * re-exports these), so both clean names and descriptions the same way.
 */

/**
 * Apply `pattern` (a global regex) until the text stops changing, so removing one match can't
 * join the pieces around it into a new one (e.g. `<scr<b>ipt>`).
 * @param {string} text
 * @param {RegExp} pattern
 * @param {string} [replacement]
 * @returns {string}
 */
export function replaceUntilStable(text, pattern, replacement = '') {
  let previous;
  do {
    previous = text;
    text = text.replace(pattern, replacement);
  } while (text !== previous);
  return text;
}

/**
 * Remove HTML and GW2 chat markup tags from catalog text. A `<` left over after that (an
 * unclosed tag) is dropped too, so no markup can survive.
 * @param {unknown} value
 * @returns {string}
 */
export function stripMarkup(value) {
  return replaceUntilStable(String(value ?? ''), /<[^>]*>/g).replace(/</g, '');
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
