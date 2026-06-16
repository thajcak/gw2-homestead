import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

const iconModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/decorations/*/icon.png',
  { eager: true, import: 'default' }
);

/** Build a map of decoration id -> optimized icon URL for the catalog grid. */
export async function buildIconManifest(): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};

  for (const [path, metadata] of Object.entries(iconModules)) {
    const match = path.match(/decorations\/(\d+)\/icon\.png$/);
    if (!match) {
      continue;
    }

    const optimized = await getImage({
      src: metadata,
      alt: '',
      width: 74,
      height: 74,
      format: 'webp',
    });

    manifest[match[1]] = optimized.src;
  }

  return manifest;
}
