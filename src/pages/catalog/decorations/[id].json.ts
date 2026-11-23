import type { APIRoute, GetStaticPaths } from 'astro';
import type { Decoration } from '../../../types';
import { buildPublishedDecoration, jsonResponse, loadDecorations } from '../../../build/catalogData';

export const prerender = true;

export const getStaticPaths = (async () =>
  (await loadDecorations()).map((decoration) => ({
    params: { id: String(decoration.id) },
    props: { decoration },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  jsonResponse(await buildPublishedDecoration((props as { decoration: Decoration }).decoration));
