/**
 * Preview images are stored at most PREVIEW_MAX_WIDTH wide, as WebP. The site never serves a
 * preview wider than that (see src/utils/buildPreviewUrls.ts), so the wiki's full-size files
 * would only bloat the repository (A8).
 */
import sharp from 'sharp';

export const PREVIEW_MAX_WIDTH = 1024;
/** High enough that the build's second WebP pass (512/768/1024 px) shows no artifacts. */
const PREVIEW_QUALITY = 90;

/** Resize `input` (a buffer or file path) and write it to `destination` as WebP. */
export async function writePreviewImage(input, destination) {
  return sharp(input)
    .rotate()
    .resize({ width: PREVIEW_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: PREVIEW_QUALITY })
    .toFile(destination);
}
