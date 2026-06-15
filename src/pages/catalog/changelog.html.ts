import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildChangelogDays } from '../../utils/buildChangelogDays';
import { renderChangelogHtml } from '../../utils/renderChangelogHtml';

export const prerender = true;

let cachedHtml: string | null = null;

export const GET: APIRoute = async () => {
  if (!cachedHtml) {
    const [decorationEntries, categoryEntries] = await Promise.all([
      getCollection('decorations'),
      getCollection('categories'),
    ]);

    cachedHtml = renderChangelogHtml(
      buildChangelogDays(
        decorationEntries.map((entry) => entry.data),
        categoryEntries.map((entry) => entry.data)
      )
    );
  }

  return new Response(cachedHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
};
