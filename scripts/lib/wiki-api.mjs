import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewRemovalConfirmed, remoteOriginalSource, utcToday } from './content-store.mjs';
import { sanitizeDisplayName } from './sanitize-text.mjs';

const WIKI_API = 'https://wiki.guildwars2.com/api.php';
const WIKI_USER_AGENT = 'gw2-homestead-sync/1.0 (https://github.com/thajcak/gw2-homestead)';
const RECIPE_JQ = `split("\\n") | map(select(length > 0) | split("\\t"))
| reduce .[] as $row ({ingredients: [], m: {}}; 
    if $row[0] == "PAIR" and ($row | length) >= 3 then
      .m[$row[1]] = ($row[2:] | join("\\t"))
    elif $row[0] == "ING" and ($row | length) >= 4 then
      .ingredients += [{
        slot: ($row[1] | tonumber),
        quantity: (if $row[2] == "" then null else ($row[2] | tonumber) end),
        item: ($row[3:] | join("\\t"))
      }]
    else . end)
  | .m + {ingredients: .ingredients}
  | .rating = (if .rating != null and (.rating | test("^[0-9]+$")) then (.rating | tonumber) else .rating end)
  | .quantity = (if .quantity != null and (.quantity | test("^[0-9]+$")) then (.quantity | tonumber) else .quantity end)
  | .upper_quantity = (if .upper_quantity != null and (.upper_quantity | test("^[0-9]+$")) then (.upper_quantity | tonumber) else .upper_quantity end)
  | .id = (if .id == null then null elif (.id | test("^[0-9]+$")) then (.id | tonumber) elif (.id | test("^[0-9]+(,[0-9]+)+$")) then .id else .id end)
  | if .timegate != null and ((.timegate | ascii_downcase) == "y" or (.timegate | ascii_downcase) == "yes") then .timegate = true else del(.timegate) end
  | if .quantity == null then del(.quantity) else . end
  | if .upper_quantity == null then del(.upper_quantity) else . end
  | with_entries(select(.value != null))
  | if (.ingredients | length) == 0 and (.name == null or .name == "") and (.id == null) then null else . end`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** MediaWiki caps a query at 50 titles for normal (non-bot) clients. */
export const WIKI_TITLES_PER_REQUEST = 50;
/** Minimum gap between wiki requests. */
export const WIKI_REQUEST_DELAY_MS = 150;
/** Ask the wiki to refuse our requests while its database replicas lag by more than this. */
const WIKI_MAXLAG_SECONDS = 5;
/** API error codes that mean "slow down and try again". */
const THROTTLE_CODES = new Set(['maxlag', 'ratelimited']);

let lastWikiRequestAt = 0;

async function waitForWikiRequestSlot() {
  const waitMs = lastWikiRequestAt + WIKI_REQUEST_DELAY_MS - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastWikiRequestAt = Date.now();
}

/** Build an api.php URL. Every request carries maxlag so the wiki can shed our load when busy. */
export function wikiApiUrl(params) {
  const search = new URLSearchParams({
    format: 'json',
    formatversion: '1',
    origin: '*',
    maxlag: String(WIKI_MAXLAG_SECONDS),
    ...params,
  });
  return `${WIKI_API}?${search}`;
}

class WikiThrottleError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.throttled = true;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(response) {
  const seconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export function normalizeWikiImageUrl(url) {
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function wikiImageUrlsMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalizeWikiImageUrl(left) === normalizeWikiImageUrl(right);
}

export function wikiLookupName(apiName) {
  return sanitizeDisplayName(apiName);
}

export function buildWikiTitleVariants(apiName) {
  const clean = wikiLookupName(apiName);
  return [`${clean} (Handiwork)`, `${clean} Decoration`, clean];
}

export async function fetchJsonWithRetries(url, maxAttempts = 5, sleepMs = 2000) {
  let lastError;
  let lastStatus;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let status;

    try {
      await waitForWikiRequestSlot();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        headers: { 'User-Agent': WIKI_USER_AGENT },
      });
      status = response.status;
      const text = await response.text();

      if (status === 403 || status === 429 || status === 503) {
        throw new WikiThrottleError(`HTTP ${status}`, retryAfterMs(response));
      }
      if (!response.ok) {
        throw new Error(`HTTP ${status}`);
      }

      const data = JSON.parse(text);
      // maxlag and rate-limit refusals come back as HTTP 200 with an API error code.
      if (THROTTLE_CODES.has(data?.error?.code)) {
        throw new WikiThrottleError(`wiki asked us to wait (${data.error.code})`, retryAfterMs(response));
      }
      if (data?.error) {
        throw new Error(`wiki API error ${data.error.code}: ${data.error.info ?? ''}`);
      }

      return data;
    } catch (error) {
      lastError = error;
      lastStatus = status ?? lastStatus;
      if (attempt < maxAttempts) {
        const waitMs = error.throttled
          ? Math.max(error.retryAfterMs ?? 0, sleepMs * attempt * 2)
          : sleepMs;
        console.warn(`Wiki fetch attempt ${attempt}/${maxAttempts} failed: ${error.message}; retrying in ${waitMs} ms.`);
        await sleep(waitMs);
      }
    }
  }

  const failure = lastError ?? new Error(`Failed to fetch ${url}`);
  failure.status = lastStatus;
  throw failure;
}

export async function tryFetchJson(url, maxAttempts = 5, sleepMs = 2000) {
  try {
    return await fetchJsonWithRetries(url, maxAttempts, sleepMs);
  } catch (error) {
    console.warn(`Wiki fetch skipped after retries: ${error.message}`);
    return null;
  }
}

export function listValidWikiPages(pages) {
  return Object.entries(pages ?? {})
    .filter(([pageId, page]) => !pageId.startsWith('-') && !page.missing && !page.invalid)
    .map(([, page]) => page);
}

export function selectWikiPage(pages) {
  const valid = listValidWikiPages(pages);
  if (valid.length === 0) {
    return null;
  }

  const withImage = valid.filter((page) => page.original?.source);
  const candidates = withImage.length > 0 ? withImage : valid;

  let fallback = null;
  for (const page of candidates) {
    const title = page.title ?? '';
    if (title.includes('Handiwork')) {
      return page;
    }
    if (title.includes('Decoration')) {
      fallback = page;
    } else if (!fallback) {
      fallback = page;
    }
  }

  return fallback;
}

function pickPage(pageList) {
  return selectWikiPage(Object.fromEntries(pageList.map((page, index) => [String(index), page])));
}

/** Split items into groups whose combined unique titles fit in one wiki request. */
function chunkByTitleCount(items, titlesOf, limit = WIKI_TITLES_PER_REQUEST) {
  const chunks = [];
  let current = [];
  let titles = new Set();

  for (const item of items) {
    const itemTitles = titlesOf(item);
    const added = itemTitles.filter((title) => !titles.has(title)).length;
    if (current.length > 0 && titles.size + added > limit) {
      chunks.push({ items: current, titles: [...titles] });
      current = [];
      titles = new Set();
    }
    current.push(item);
    itemTitles.forEach((title) => titles.add(title));
  }
  if (current.length > 0) {
    chunks.push({ items: current, titles: [...titles] });
  }
  return chunks;
}

/**
 * Run one action=query for up to 50 titles, following `continue` until complete. Returns null
 * if any request failed, else { pages, resolveTitle }: the query's pages object (in the wiki's
 * order, page properties merged across continuations) and a function mapping a requested title
 * through normalization and redirects to the page title it ends up at.
 */
async function queryWikiTitles(titles, params) {
  const pages = {};
  const aliases = new Map();
  let continueParams = {};

  for (let round = 0; round < 20; round += 1) {
    const url = wikiApiUrl({ action: 'query', titles: titles.join('|'), ...params, ...continueParams });
    const data = await tryFetchJson(url, 5, 2000);
    if (!data?.query) {
      return null;
    }

    for (const { from, to } of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
      aliases.set(from, to);
    }
    for (const [pageId, page] of Object.entries(data.query.pages ?? {})) {
      const previous = pages[pageId] ?? {};
      pages[pageId] = { ...previous, ...page, ...(previous.revisions && !page.revisions ? { revisions: previous.revisions } : {}) };
    }

    if (!data.continue) {
      const resolveTitle = (title) => {
        let current = title;
        for (let hops = 0; hops < 5 && aliases.has(current); hops += 1) {
          current = aliases.get(current);
        }
        return current;
      };
      return { pages, resolveTitle };
    }
    const { continue: _marker, ...rest } = data.continue;
    continueParams = rest;
  }

  console.warn('Wiki query kept asking to continue; giving up on this batch.');
  return null;
}

function lookupTitles(decoration) {
  return [
    ...new Set([
      ...(decoration.wikiTitle ? [decoration.wikiTitle] : []),
      ...buildWikiTitleVariants(decoration.name),
    ]),
  ];
}

/**
 * Ask the wiki about each decoration's stored wikiTitle and every title variant, batching many
 * decorations into each request (redirects followed). Returns a Map from decoration id to null
 * (the request failed) or { pages, storedPage }: the valid pages among that decoration's titles,
 * and the page its stored wikiTitle resolves to (null if it no longer exists).
 */
export async function lookupWikiPagesBatch(decorations) {
  const lookups = new Map();

  for (const chunk of chunkByTitleCount(decorations, lookupTitles)) {
    const result = await queryWikiTitles(chunk.titles, {
      redirects: '1',
      prop: 'pageimages',
      piprop: 'original',
      pilimit: 'max',
    });

    for (const decoration of chunk.items) {
      if (!result) {
        lookups.set(decoration.id, null);
        continue;
      }
      const resolved = new Set(lookupTitles(decoration).map(result.resolveTitle));
      const pages = listValidWikiPages(result.pages).filter((page) => resolved.has(page.title));
      const storedTitle = decoration.wikiTitle ? result.resolveTitle(decoration.wikiTitle) : null;
      const storedPage = storedTitle ? (pages.find((page) => page.title === storedTitle) ?? null) : null;
      lookups.set(decoration.id, { pages, storedPage });
    }
  }

  return lookups;
}

/**
 * Fetch the current wikitext of many pages, batched. Returns a Map from each requested title
 * to its wikitext ('' when the page is missing or the request failed).
 */
export async function fetchWikiWikitextBatch(titles) {
  const wikitextByTitle = new Map();
  const unique = [...new Set(titles)];

  for (const chunk of chunkByTitleCount(unique, (title) => [title])) {
    const result = await queryWikiTitles(chunk.titles, {
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
    });
    const byTitle = new Map(
      Object.values(result?.pages ?? {})
        .filter((page) => !page.missing && !page.invalid)
        .map((page) => [page.title, page.revisions?.[0]?.slots?.main?.['*'] ?? ''])
    );
    for (const title of chunk.titles) {
      wikitextByTitle.set(title, result ? (byTitle.get(result.resolveTitle(title)) ?? '') : '');
    }
  }

  return wikitextByTitle;
}

export function wikitextToRecipeJson(wikitext) {
  const awkPath = join(dirname(fileURLToPath(import.meta.url)), 'wiki-recipe-parser.awk');
  const awkResult = spawnSync('awk', ['-f', awkPath], {
    input: wikitext,
    encoding: 'utf8',
  });

  if (awkResult.status !== 0 || !awkResult.stdout.trim()) {
    return null;
  }

  const jqResult = spawnSync('jq', ['-Rs', RECIPE_JQ], {
    input: awkResult.stdout,
    encoding: 'utf8',
  });

  if (jqResult.status !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(jqResult.stdout || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function needsRecipe(decoration) {
  return Boolean(decoration.wikiTitle) && decoration.recipe == null;
}

function withoutMissingMarker(decoration) {
  const { previewMissingSince: _previewMissingSince, ...rest } = decoration;
  return rest;
}

/**
 * Apply one wiki lookup (from lookupWikiPagesBatch) to a decoration.
 *
 * The stored wikiTitle is often the "(Handiwork)" recipe page while the image comes from
 * another title variant, so images are tracked across all queried pages:
 * - Keep the stored image while ANY queried page still shows it. This is what stops the
 *   run-to-run flipping between variant pages.
 * - Replace it only when no page shows it any more AND the stored page has an image of its
 *   own. A variant page's image never replaces a stored one: a bare title can be an unrelated
 *   article (e.g. "Firecracker" is the consumable, not the decoration). Variants only supply a
 *   first image.
 * - When no page has an image at all, keep the stored one and stamp previewMissingSince.
 *   pageimages often omits images that still exist, so the image is only removed once that has
 *   held for PREVIEW_MISSING_GRACE_DAYS and the stored file itself is gone from the wiki
 *   (lookup.storedImageGone, checked by enrichDecorationFromWiki).
 * - The stored wikiTitle is kept while its page exists (recipes and the wiki link use it).
 */
export function applyWikiImageMetadata(decoration, lookup, today = utcToday()) {
  const label = `${wikiLookupName(decoration.name)} (ID: ${decoration.id})`;

  if (!lookup || lookup.pages.length === 0) {
    return decoration;
  }

  const { pages, storedPage } = lookup;
  const withImage = pages.filter((page) => page.original?.source);
  const titlePage = storedPage ?? pickPage(withImage.length > 0 ? withImage : pages);
  let next = { ...decoration, wikiTitle: titlePage.title };

  if (withImage.length === 0) {
    const missingSince = decoration.previewMissingSince ?? today;
    next.previewMissingSince = missingSince;

    if (decoration.original && previewRemovalConfirmed(next, today) && lookup.storedImageGone) {
      console.warn(`Wiki has had no preview for ${label} since ${missingSince} and the file is gone; removing stored image.`);
      next.original = null;
    } else if (decoration.original) {
      console.warn(`No wiki preview reported for ${label} (since ${missingSince}); keeping stored image.`);
    } else {
      console.warn(`No wiki preview available for ${label}`);
    }
    return next;
  }

  next = withoutMissingMarker(next);
  const currentRemote = remoteOriginalSource(decoration);
  if (currentRemote && withImage.some((page) => wikiImageUrlsMatch(page.original.source, currentRemote))) {
    return next;
  }

  const imagePage = storedPage?.original?.source ? storedPage : currentRemote ? null : pickPage(withImage);
  if (!imagePage) {
    console.warn(`Stored image for ${label} is no longer on its wiki page, which has none; keeping it.`);
    return next;
  }
  if (currentRemote) {
    console.log(`Wiki image changed for ${label}: now from "${imagePage.title}"`);
  }
  next.original = {
    width: imagePage.original.width,
    height: imagePage.original.height,
    source: imagePage.original.source,
  };
  return next;
}

/** True only when the wiki answers 404/410 for the file; any other outcome counts as present. */
async function wikiFileIsGone(url) {
  try {
    await waitForWikiRequestSlot();
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': WIKI_USER_AGENT },
    });
    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
}

/**
 * Enrich many decorations from the wiki: batched page lookups (images, wikiTitle), then batched
 * wikitext fetches for the ones still missing a recipe. Returns a Map from id to the enriched
 * decoration; a decoration whose lookup failed comes back unchanged.
 */
export async function enrichDecorationsFromWiki(decorations) {
  const enriched = new Map();
  const lookups = await lookupWikiPagesBatch(decorations);

  for (const decoration of decorations) {
    const label = `${wikiLookupName(decoration.name)} (ID: ${decoration.id})`;
    const lookup = lookups.get(decoration.id);
    if (!lookup) {
      console.warn(`Wiki lookup failed for decoration ${label}; keeping stored data.`);
      enriched.set(decoration.id, decoration);
      continue;
    }
    if (lookup.pages.length === 0) {
      console.warn(`No valid wiki page found for decoration ${label}`);
    }

    try {
      // Before a stored image may be dropped, confirm the file itself is gone from the wiki.
      const noImages = lookup.pages.every((page) => !page.original?.source);
      const storedRemote = remoteOriginalSource(decoration);
      if (
        noImages &&
        storedRemote &&
        previewRemovalConfirmed({ previewMissingSince: decoration.previewMissingSince ?? utcToday() })
      ) {
        lookup.storedImageGone = await wikiFileIsGone(storedRemote);
      }
      enriched.set(decoration.id, applyWikiImageMetadata(decoration, lookup));
    } catch (error) {
      console.warn(`Wiki enrichment failed for ${label}: ${error.message}`);
      enriched.set(decoration.id, decoration);
    }
  }

  const recipeTitles = [...enriched.values()].filter(needsRecipe).map((decoration) => decoration.wikiTitle);
  if (recipeTitles.length > 0) {
    const wikitextByTitle = await fetchWikiWikitextBatch(recipeTitles);
    for (const [id, decoration] of enriched) {
      if (!needsRecipe(decoration)) {
        continue;
      }
      const wikitext = wikitextByTitle.get(decoration.wikiTitle);
      const recipe = wikitext ? wikitextToRecipeJson(wikitext) : null;
      if (recipe) {
        enriched.set(id, { ...decoration, recipe });
      }
    }
  }

  return enriched;
}
