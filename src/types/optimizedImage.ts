/** Build-time optimized image metadata (same fields Astro's Image component emits). */
export interface OptimizedImage {
  src: string;
  width: number;
  height: number;
  srcSet?: string;
  sizes?: string;
}
