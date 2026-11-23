/**
 * Decoration icons packed into a few sprite sheets (F8). The grid draws each icon as a CSS
 * background from its sheet, so the browser makes about a dozen requests and image decodes
 * instead of one per decoration (1,200+), which also avoids the compositor crashes that many
 * small <img> elements caused in Chrome.
 *
 * Sheets follow the grid's default order (by name), so the first screen needs one or two of
 * them. Each file name carries a hash of its contents, so a deploy never pairs a new search
 * index with a cached old sheet.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { SPRITE_COLUMNS, SPRITE_ICON_SIZE, type SpriteRef } from '../utils/sprite';

const ICONS_PER_SHEET = 100;
const ICONS_DIR = join(process.cwd(), 'src/assets/decorations');

export interface SpriteSheet {
  /** File name under catalog/icons/. */
  file: string;
  data: Buffer;
}

export interface IconSprites {
  sheets: SpriteSheet[];
  /** Decoration id -> [sheet index, cell index]. */
  cells: Map<number, SpriteRef>;
}

async function buildSheet(index: number, ids: number[]): Promise<SpriteSheet> {
  const rows = Math.ceil(ids.length / SPRITE_COLUMNS);
  const tiles = await Promise.all(
    ids.map(async (id, cell) => ({
      input: await sharp(join(ICONS_DIR, String(id), 'icon.png'))
        .resize(SPRITE_ICON_SIZE, SPRITE_ICON_SIZE)
        .toBuffer(),
      left: (cell % SPRITE_COLUMNS) * SPRITE_ICON_SIZE,
      top: Math.floor(cell / SPRITE_COLUMNS) * SPRITE_ICON_SIZE,
    }))
  );

  const data = await sharp({
    create: {
      width: SPRITE_COLUMNS * SPRITE_ICON_SIZE,
      height: rows * SPRITE_ICON_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();

  const hash = createHash('sha256').update(data).digest('hex').slice(0, 10);
  return { file: `icons-${index}.${hash}.webp`, data };
}

/** Pack the icons of `orderedIds` (in display order) into sheets; ids without an icon are skipped. */
export async function buildIconSprites(orderedIds: number[]): Promise<IconSprites> {
  const withIcon = orderedIds.filter((id) => existsSync(join(ICONS_DIR, String(id), 'icon.png')));
  const cells = new Map<number, SpriteRef>();
  const groups: number[][] = [];

  withIcon.forEach((id, position) => {
    const sheet = Math.floor(position / ICONS_PER_SHEET);
    (groups[sheet] ??= []).push(id);
    cells.set(id, [sheet, position % ICONS_PER_SHEET]);
  });

  const sheets = await Promise.all(groups.map((ids, index) => buildSheet(index, ids)));
  return { sheets, cells };
}
