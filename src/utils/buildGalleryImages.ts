import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { OptimizedImage } from '../types/optimizedImage';
import { toOptimizedImage } from './toOptimizedImage';

/** Views are shown in the preview's place, so they get the preview's sizes (buildPreviewUrls.ts). */
const VIEW_MAX_WIDTH = 1024;
const VIEW_WIDTHS = [512, 768, VIEW_MAX_WIDTH];
const VIEW_SIZES = '(max-width: 768px) 100vw, 66vw';
/** Thumbnails are drawn 56px tall (global.css), so twice that for sharp screens. */
const THUMB_HEIGHT = 112;
/** Very tall or wide images are cropped to these widths so every thumbnail stays clickable. */
const THUMB_MIN_WIDTH = 56;
const THUMB_MAX_WIDTH = 224;

const assetModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/decorations/*/{preview,view-*}.webp',
  { eager: true }
);

/** The imported asset for a content path such as "decorations/12/view-abc.webp". */
function assetFor(source: string): ImageMetadata | undefined {
  return assetModules[`../assets/${source}`]?.default;
}

/** A downloaded gallery view, optimized like the preview; null when its file isn't local yet. */
export async function optimizeView(source: string): Promise<OptimizedImage | null> {
  const asset = assetFor(source);
  if (!asset) {
    return null;
  }
  const image = await getImage({
    src: asset,
    width: VIEW_MAX_WIDTH,
    widths: VIEW_WIDTHS,
    sizes: VIEW_SIZES,
    format: 'webp',
  });
  return toOptimizedImage(image);
}

/** A small thumbnail of the preview or a view for the gallery strip. */
export async function buildThumbnail(source: string): Promise<OptimizedImage | null> {
  const asset = assetFor(source);
  if (!asset) {
    return null;
  }
  const width = Math.min(
    THUMB_MAX_WIDTH,
    Math.max(THUMB_MIN_WIDTH, Math.round((THUMB_HEIGHT * asset.width) / asset.height))
  );
  const image = await getImage({ src: asset, width, height: THUMB_HEIGHT, fit: 'cover', format: 'webp' });
  return toOptimizedImage(image);
}
