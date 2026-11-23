import type { APIRoute } from 'astro';
import { buildSearchIndex, jsonResponse } from '../../build/catalogData';

export const prerender = true;

export const GET: APIRoute = async () => jsonResponse(await buildSearchIndex());
