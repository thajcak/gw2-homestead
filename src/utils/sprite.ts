/** Shared by the sprite build (src/build/iconSprites.ts) and the pages that draw from it. */
export const SPRITE_COLUMNS = 10;
/** The GW2 API's icons are 64 px squares; sheets keep them at that size. */
export const SPRITE_ICON_SIZE = 64;

/** Where a decoration's icon sits: [sheet index, cell index within the sheet]. */
export type SpriteRef = [sheet: number, cell: number];

/**
 * Inline style for an element of class `sprite-icon` that draws `ref` from its sheet. The
 * element's `--sprite-size` (set in CSS) picks the drawn size.
 */
export function spriteStyle(ref: SpriteRef, sheetUrls: string[]): string {
  const [sheet, cell] = ref;
  return `--sprite-col:${cell % SPRITE_COLUMNS};--sprite-row:${Math.floor(cell / SPRITE_COLUMNS)};background-image:url('${sheetUrls[sheet]}')`;
}
