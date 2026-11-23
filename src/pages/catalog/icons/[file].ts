import type { APIRoute, GetStaticPaths } from 'astro';
import { loadIconSprites } from '../../../build/catalogData';

export const prerender = true;

/** catalog/icons/icons-{n}.{hash}.webp: the icon sprite sheets (see build/iconSprites.ts). */
export const getStaticPaths = (async () =>
  (await loadIconSprites()).sheets.map((sheet) => ({
    params: { file: sheet.file },
    props: { data: sheet.data },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(new Uint8Array((props as { data: Buffer }).data), {
    headers: { 'Content-Type': 'image/webp' },
  });
