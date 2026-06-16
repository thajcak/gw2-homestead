import type { APIRoute } from 'astro';
import { buildIconManifest } from '../../build/iconManifest';

export const prerender = true;

let cachedManifest: Record<string, string> | null = null;

export const GET: APIRoute = async () => {
  if (!cachedManifest) {
    cachedManifest = await buildIconManifest();
  }

  return new Response(JSON.stringify(cachedManifest), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
