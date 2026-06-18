import type { GetImageResult } from 'astro/assets';
import type { OptimizedImage } from '../types/optimizedImage';

/** Convert a getImage() result into client-serializable img attributes. */
export function toOptimizedImage(image: GetImageResult): OptimizedImage {
  const optimized: OptimizedImage = {
    src: image.src,
    width: Number(image.attributes.width),
    height: Number(image.attributes.height),
  };

  if (image.srcSet.values.length > 0) {
    optimized.srcSet = image.srcSet.attribute;
  }

  if (image.attributes.sizes) {
    optimized.sizes = String(image.attributes.sizes);
  }

  return optimized;
}
