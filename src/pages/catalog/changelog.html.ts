import type { APIRoute } from 'astro';
import { loadDecorations, loadIconSprites, loadSpriteSheetUrls } from '../../build/catalogData';
import { buildChangelogDays } from '../../utils/buildChangelogDays';
import { renderChangelogHtml } from '../../utils/renderChangelogHtml';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [decorations, { cells }, sheetUrls] = await Promise.all([
    loadDecorations(),
    loadIconSprites(),
    loadSpriteSheetUrls(),
  ]);

  return new Response(renderChangelogHtml(buildChangelogDays(decorations, cells), sheetUrls), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
