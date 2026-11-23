import { getCollection } from 'astro:content';
import type { Category, Decoration } from '../types';
import type { OptimizedImage } from '../types/optimizedImage';
import { assetUrl } from '../utils/assetUrl';
import { buildThumbnail, optimizeView } from '../utils/buildGalleryImages';
import { buildPreviewUrls } from '../utils/buildPreviewUrls';
import { meaningfulDescription, sanitizeDisplayName } from '../utils/sanitizeText';
import type { SpriteRef } from '../utils/sprite';
import { buildIconSprites, type IconSprites } from './iconSprites';

/** One row of catalog/search-index.json: everything the grid, search and filters need. */
export interface SearchIndexEntry {
  id: number;
  name: string;
  description: string;
  categories: number[];
  /** Icon cell in the sprite sheets; absent when the decoration has no local icon. */
  sprite?: SpriteRef;
}

/** One image in the detail panel's gallery strip. */
export interface GalleryImage {
  image: OptimizedImage;
  thumb: OptimizedImage;
  /** The wiki's caption ("Side view"); absent for the preview and for uncaptioned views. */
  caption?: string;
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
  /**
   * The preview first, then the wiki gallery's other views. Present only when there is at least
   * one downloaded view besides the preview.
   */
  gallery?: GalleryImage[];
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
      ...(sprite ? { sprite } : {}),
    };
  });
}

/**
 * The gallery strip for a decoration: its preview, then each downloaded view. Undefined when
 * there's nothing to switch between (no preview, or no downloaded view).
 */
async function buildGallery(
  decoration: Decoration,
  preview: OptimizedImage | undefined
): Promise<GalleryImage[] | undefined> {
  const previewSource = decoration.original?.source;
  if (!preview || !previewSource || !decoration.views?.length) {
    return undefined;
  }

  const views = await Promise.all(
    decoration.views.map(async (view) => {
      const [image, thumb] = await Promise.all([optimizeView(view.source), buildThumbnail(view.source)]);
      return image && thumb ? { image, thumb, ...(view.caption ? { caption: view.caption } : {}) } : null;
    })
  );
  const downloaded = views.filter((view): view is GalleryImage => view != null);
  const previewThumb = await buildThumbnail(previewSource);
  if (downloaded.length === 0 || !previewThumb) {
    return undefined;
  }
  return [{ image: preview, thumb: previewThumb }, ...downloaded];
}

export async function buildPublishedDecoration(decoration: Decoration): Promise<PublishedDecoration> {
  const preview = (await loadPreviews())[String(decoration.id)];
  const gallery = await buildGallery(decoration, preview);
  return {
    id: decoration.id,
    name: sanitizeDisplayName(decoration.name),
    description: meaningfulDescription(decoration.description),
    categories: decoration.categories,
    ...(decoration.wikiTitle ? { wikiTitle: decoration.wikiTitle } : {}),
    ...(decoration.recipe != null ? { recipe: decoration.recipe } : {}),
    ...(preview ? { preview } : {}),
    ...(gallery ? { gallery } : {}),
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
