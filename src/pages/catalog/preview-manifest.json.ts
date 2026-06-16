import type { APIRoute } from 'astro';
import { buildPreviewUrls } from '../../utils/buildPreviewUrls';

export const prerender = true;

let cachedManifest: Record<string, string> | null = null;

export const GET: APIRoute = async () => {
  if (!cachedManifest) {
    cachedManifest = await buildPreviewUrls();
  }

  return new Response(JSON.stringify(cachedManifest), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
