import { getCollection } from 'astro:content';
import type { Category, Decoration } from '../types';
import type { OptimizedImage } from '../types/optimizedImage';
import { buildPreviewUrls } from '../utils/buildPreviewUrls';
import { sanitizeDisplayName, sanitizeText } from '../utils/sanitizeText';
import { buildIconManifest } from './iconManifest';

/** One row of catalog/search-index.json: everything the grid, search and filters need. */
export interface SearchIndexEntry {
  id: number;
  name: string;
  description: string;
  categories: number[];
  /** Optimized icon URL; absent when the decoration has no local icon. */
  icon?: string;
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
}

// Each endpoint module is evaluated once per build; cache the expensive parts across routes.
let decorationsPromise: Promise<Decoration[]> | null = null;
let iconsPromise: Promise<Record<string, string>> | null = null;
let previewsPromise: Promise<Record<string, OptimizedImage>> | null = null;

export function loadDecorations(): Promise<Decoration[]> {
  decorationsPromise ??= getCollection('decorations').then((entries) =>
    entries.map((entry) => entry.data).sort((a, b) => a.id - b.id)
  );
  return decorationsPromise;
}

function loadIcons() {
  iconsPromise ??= buildIconManifest();
  return iconsPromise;
}

function loadPreviews() {
  previewsPromise ??= buildPreviewUrls();
  return previewsPromise;
}

export async function buildSearchIndex(): Promise<SearchIndexEntry[]> {
  const [decorations, icons] = await Promise.all([loadDecorations(), loadIcons()]);
  return decorations
    .map((decoration) => {
      const icon = icons[String(decoration.id)];
      return {
        id: decoration.id,
        name: sanitizeDisplayName(decoration.name),
        description: sanitizeText(decoration.description ?? ''),
        categories: decoration.categories,
        ...(icon ? { icon } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildPublishedDecoration(decoration: Decoration): Promise<PublishedDecoration> {
  const preview = (await loadPreviews())[String(decoration.id)];
  return {
    id: decoration.id,
    name: sanitizeDisplayName(decoration.name),
    description: sanitizeText(decoration.description ?? ''),
    categories: decoration.categories,
    ...(decoration.wikiTitle ? { wikiTitle: decoration.wikiTitle } : {}),
    ...(decoration.recipe != null ? { recipe: decoration.recipe } : {}),
    ...(preview ? { preview } : {}),
  };
}

export async function buildCategories(): Promise<Pick<Category, 'id' | 'name'>[]> {
  const entries = await getCollection('categories');
  return entries
    .map(({ data }) => ({ id: data.id, name: sanitizeDisplayName(data.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
