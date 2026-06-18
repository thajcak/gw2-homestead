import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { OptimizedImage } from '../types/optimizedImage';
import { toOptimizedImage } from './toOptimizedImage';

const PREVIEW_MAX_WIDTH = 1024;
const PREVIEW_WIDTHS = [512, 768, PREVIEW_MAX_WIDTH];
const PREVIEW_SIZES = '(max-width: 768px) 100vw, 66vw';
const OPTIMIZE_CHUNK_SIZE = 40;

const previewModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/decorations/*/preview.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

async function optimizePreview(
  id: string,
  module: { default: ImageMetadata }
): Promise<[string, OptimizedImage]> {
  const image = await getImage({
    src: module.default,
    width: PREVIEW_MAX_WIDTH,
    widths: PREVIEW_WIDTHS,
    sizes: PREVIEW_SIZES,
    format: 'webp',
  });
  return [id, toOptimizedImage(image)];
}

export async function buildPreviewUrls(): Promise<Record<string, OptimizedImage>> {
  const entries = Object.entries(previewModules)
    .map(([path, module]) => {
      const match = path.match(/decorations\/(\d+)\/preview\./i);
      return match ? ([match[1], module] as const) : null;
    })
    .filter((entry): entry is [string, { default: ImageMetadata }] => entry != null);

  const urls: Record<string, OptimizedImage> = {};

  for (let index = 0; index < entries.length; index += OPTIMIZE_CHUNK_SIZE) {
    const chunk = entries.slice(index, index + OPTIMIZE_CHUNK_SIZE);
    const optimized = await Promise.all(chunk.map(([id, module]) => optimizePreview(id, module)));
    for (const [id, preview] of optimized) {
      urls[id] = preview;
    }
  }

  return urls;
}
