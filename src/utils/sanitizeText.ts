import { sanitizeText } from '../../scripts/lib/sanitize-text.mjs';

export { sanitizeDisplayName, sanitizeText } from '../../scripts/lib/sanitize-text.mjs';

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
