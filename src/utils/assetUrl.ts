/** Resolve a public-root-relative asset path for the current site base. */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  if (!path) {
    return path;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\//, '')}`;
}
