import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

const PREVIEW_MAX_WIDTH = 1024;
const OPTIMIZE_CHUNK_SIZE = 40;

const previewModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/decorations/*/preview.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

async function optimizePreview(id: string, module: { default: ImageMetadata }): Promise<[string, string]> {
  const image = await getImage({
    src: module.default,
    width: PREVIEW_MAX_WIDTH,
    format: 'webp',
  });
  return [id, image.src];
}

export async function buildPreviewUrls(): Promise<Record<string, string>> {
  const entries = Object.entries(previewModules)
    .map(([path, module]) => {
      const match = path.match(/decorations\/(\d+)\/preview\./i);
      return match ? ([match[1], module] as const) : null;
    })
    .filter((entry): entry is [string, { default: ImageMetadata }] => entry != null);

  const urls: Record<string, string> = {};

  for (let index = 0; index < entries.length; index += OPTIMIZE_CHUNK_SIZE) {
    const chunk = entries.slice(index, index + OPTIMIZE_CHUNK_SIZE);
    const optimized = await Promise.all(chunk.map(([id, module]) => optimizePreview(id, module)));
    for (const [id, src] of optimized) {
      urls[id] = src;
    }
  }

  return urls;
}
