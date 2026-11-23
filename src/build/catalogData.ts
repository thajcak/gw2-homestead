import { getCollection } from 'astro:content';
import type { Category, Decoration } from '../types';
import type { OptimizedImage } from '../types/optimizedImage';
import { assetUrl } from '../utils/assetUrl';
import { buildPreviewUrls } from '../utils/buildPreviewUrls';
import { meaningfulDescription, sanitizeDisplayName } from '../utils/sanitizeText';
import type { SpriteRef } from '../utils/sprite';
import { buildIconSprites, type IconSprites } from './iconSprites';

/** One row of catalog/search-index.json: everything the grid, search, filters and sort need. */
export interface SearchIndexEntry {
  id: number;
  name: string;
  description: string;
  categories: number[];
  /** Day the decoration first appeared (YYYY-MM-DD), for "Newest first". */
  added?: string;
  /** Icon cell in the sprite sheets; absent when the decoration has no local icon. */
  sprite?: SpriteRef;
}

/** catalog/decorations/{id}.json: what the detail panel needs, fetched when it opens. */
export interface PublishedDecoration {
  id: number;
  name: string;
  description: string;
  categories: number[];
  wikiTitle?: string;
  recipe?: Decoration['recipe'];
  /** Optimized preview image; absent when the decoration has no preview. */
  preview?: OptimizedImage;
  /** Day the decoration left the game. Its JSON stays so old deep links can say so. */
  removed?: string;
}

// Each endpoint module is evaluated once per build; cache the expensive parts across routes.
let decorationsPromise: Promise<Decoration[]> | null = null;
let spritesPromise: Promise<IconSprites> | null = null;
let previewsPromise: Promise<Record<string, OptimizedImage>> | null = null;

/** Every decoration ever seen, removed ones included, by id. */
export function loadDecorations(): Promise<Decoration[]> {
  decorationsPromise ??= getCollection('decorations').then((entries) =>
    entries.map((entry) => entry.data).sort((a, b) => a.id - b.id)
  );
  return decorationsPromise;
}

/** Decorations still in the game, in the grid's default order (by name). */
export async function loadCatalogDecorations(): Promise<Decoration[]> {
  return (await loadDecorations())
    .filter((decoration) => !decoration.removed)
    .sort((a, b) => sanitizeDisplayName(a.name).localeCompare(sanitizeDisplayName(b.name)));
}

export function loadIconSprites(): Promise<IconSprites> {
  spritesPromise ??= loadCatalogDecorations().then((decorations) =>
    buildIconSprites(decorations.map((decoration) => decoration.id))
  );
  return spritesPromise;
}

/** Published URLs of the sprite sheets, by sheet index. */
export async function loadSpriteSheetUrls(): Promise<string[]> {
  const { sheets } = await loadIconSprites();
  return sheets.map((sheet) => assetUrl(`catalog/icons/${sheet.file}`));
}

function loadPreviews() {
  previewsPromise ??= buildPreviewUrls();
  return previewsPromise;
}

export async function buildSearchIndex(): Promise<SearchIndexEntry[]> {
  const [decorations, { cells }] = await Promise.all([loadCatalogDecorations(), loadIconSprites()]);
  return decorations.map((decoration) => {
    const sprite = cells.get(decoration.id);
    return {
      id: decoration.id,
      name: sanitizeDisplayName(decoration.name),
      description: meaningfulDescription(decoration.description),
      categories: decoration.categories,
      ...(decoration.added ? { added: decoration.added } : {}),
      ...(sprite ? { sprite } : {}),
    };
  });
}

export async function buildPublishedDecoration(decoration: Decoration): Promise<PublishedDecoration> {
  const preview = (await loadPreviews())[String(decoration.id)];
  return {
    id: decoration.id,
    name: sanitizeDisplayName(decoration.name),
    description: meaningfulDescription(decoration.description),
    categories: decoration.categories,
    ...(decoration.wikiTitle ? { wikiTitle: decoration.wikiTitle } : {}),
    ...(decoration.recipe != null ? { recipe: decoration.recipe } : {}),
    ...(preview ? { preview } : {}),
    ...(decoration.removed ? { removed: decoration.removed } : {}),
  };
}

/** Categories still in the game, by name. */
export async function buildCategories(): Promise<Pick<Category, 'id' | 'name'>[]> {
  const entries = await getCollection('categories');
  return entries
    .filter(({ data }) => !data.removed)
    .map(({ data }) => ({ id: data.id, name: sanitizeDisplayName(data.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
