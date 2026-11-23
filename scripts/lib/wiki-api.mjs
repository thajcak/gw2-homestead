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
/**
 * The wiki's web server answers a plain 403 to URLs longer than about 2,100 characters (2,083
 * passed, 2,132 failed when measured in Nov 2026), so batches are also capped by URL length,
 * with room left for a continuation parameter.
 */
export const WIKI_MAX_URL_LENGTH = 1900;
/** Minimum gap between wiki requests. */
export const WIKI_REQUEST_DELAY_MS = 150;
/** API error code that means "slow down and try again". */
const THROTTLE_CODE = 'ratelimited';

let lastWikiRequestAt = 0;
let requestCount = 0;

/** Wiki requests sent so far by this process, retries included. */
export function wikiRequestCount() {
  return requestCount;
}

async function waitForWikiRequestSlot() {
  const waitMs = lastWikiRequestAt + WIKI_REQUEST_DELAY_MS - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastWikiRequestAt = Date.now();
  requestCount += 1;
}

/** Build an api.php URL. */
export function wikiApiUrl(params) {
  const search = new URLSearchParams({
    format: 'json',
    formatversion: '1',
    origin: '*',
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
      // A rate-limit refusal can come back as HTTP 200 with an API error code.
      if (data?.error?.code === THROTTLE_CODE) {
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

function queryUrl(titles, params) {
  return wikiApiUrl({ action: 'query', titles: titles.join('|'), ...params });
}

/**
 * Split items into groups whose combined unique titles fit in one wiki request: at most
 * WIKI_TITLES_PER_REQUEST titles and a URL no longer than WIKI_MAX_URL_LENGTH.
 */
function chunkTitles(items, titlesOf, params) {
  const chunks = [];
  let current = [];
  let titles = new Set();

  for (const item of items) {
    const itemTitles = titlesOf(item);
    const merged = new Set([...titles, ...itemTitles]);
    const fits =
      merged.size <= WIKI_TITLES_PER_REQUEST && queryUrl([...merged], params).length <= WIKI_MAX_URL_LENGTH;
    if (current.length > 0 && !fits) {
      chunks.push({ items: current, titles: [...titles] });
      current = [];
      titles = new Set(itemTitles);
    } else {
      titles = merged;
    }
    current.push(item);
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
    const url = queryUrl(titles, { ...params, ...continueParams });
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

/**
 * Page lookups ask for the lead image (pageimages) and the lead section's wikitext, which holds
 * the decoration infobox and its gallery, in the same request.
 */
const LOOKUP_PARAMS = {
  redirects: '1',
  prop: 'pageimages|revisions',
  piprop: 'original',
  pilimit: 'max',
  rvprop: 'content',
  rvslots: 'main',
  rvsection: '0',
};
const WIKITEXT_PARAMS = { prop: 'revisions', rvprop: 'content', rvslots: 'main' };
const FILE_INFO_PARAMS = { redirects: '1', prop: 'imageinfo', iiprop: 'url|size' };
/** The infobox gallery has five slots (Template:Item infobox gallery). */
const INFOBOX_GALLERY_SLOTS = 5;

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

  for (const chunk of chunkTitles(decorations, lookupTitles, LOOKUP_PARAMS)) {
    const result = await queryWikiTitles(chunk.titles, LOOKUP_PARAMS);

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
 * The top-level parameters of the first {{Decoration infobox}} call in `wikitext`, as a Map from
 * lowercased name to trimmed value, or null when the page has no complete decoration infobox.
 * Other infoboxes (an item or object page under a bare title) don't count: they describe
 * something else.
 */
export function parseDecorationInfobox(wikitext) {
  const text = (wikitext ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const start = text.search(/\{\{\s*decoration infobox\s*[|}]/i);
  if (start < 0) {
    return null;
  }

  const parts = [];
  let current = '';
  let templateDepth = 0;
  let linkDepth = 0;
  let closed = false;
  for (let index = start + 2; index < text.length; ) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{') {
      templateDepth += 1;
    } else if (pair === '}}' && templateDepth === 0) {
      closed = true;
      break;
    } else if (pair === '}}') {
      templateDepth -= 1;
    } else if (pair === '[[') {
      linkDepth += 1;
    } else if (pair === ']]' && linkDepth > 0) {
      linkDepth -= 1;
    } else if (text[index] === '|' && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    const step = ['{{', '}}', '[[', ']]'].includes(pair) ? 2 : 1;
    current += text.slice(index, index + step);
    index += step;
  }
  if (!closed) {
    return null;
  }
  parts.push(current);

  const params = new Map();
  for (const part of parts.slice(1)) {
    const equals = part.indexOf('=');
    if (equals > 0) {
      params.set(part.slice(0, equals).trim().toLowerCase(), part.slice(equals + 1).trim());
    }
  }
  return params;
}

/** A wiki file name as MediaWiki stores it: no namespace, spaces for underscores, first letter upper case. */
export function normalizeWikiFileName(name) {
  const clean = (name ?? '')
    .trim()
    .replace(/^(file|image):/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
}

/** The file name in a wiki image URL (…/images/a/ab/Some_File.jpg -> "Some File.jpg"). */
function wikiFileNameFromUrl(url) {
  try {
    return normalizeWikiFileName(decodeURIComponent(new URL(url).pathname.split('/').pop()));
  } catch {
    return '';
  }
}

/**
 * The images a decoration page's infobox gallery shows, in order, as { slot, file, caption }.
 * Slot 1 defaults to "{page title}.jpg" (with ":" as "-") when gallery1 is blank, as
 * Template:Item infobox gallery does. A listed file may not exist; the wiki shows only those
 * that do. Returns [] for a page without a decoration infobox.
 */
export function infoboxGalleryImages(page) {
  const params = parseDecorationInfobox(page?.revisions?.[0]?.slots?.main?.['*']);
  if (!params) {
    return [];
  }

  const images = [];
  for (let slot = 1; slot <= INFOBOX_GALLERY_SLOTS; slot += 1) {
    const listed = normalizeWikiFileName(params.get(`gallery${slot}`));
    const file = listed || (slot === 1 ? normalizeWikiFileName(`${page.title.replace(/:/g, '-')}.jpg`) : '');
    if (file) {
      images.push({ slot, file, caption: params.get(`gallery${slot}-text`) || null });
    }
  }
  return images;
}

/**
 * Look up many wiki files at once (redirects followed). Returns a Map from each requested name
 * to { source, width, height }, or to null when the file does not exist; returns null if any
 * request failed.
 */
export async function fetchWikiFileInfoBatch(fileNames) {
  const info = new Map();
  const unique = [...new Set(fileNames)];

  for (const chunk of chunkTitles(unique, (name) => [`File:${name}`], FILE_INFO_PARAMS)) {
    const result = await queryWikiTitles(chunk.titles, FILE_INFO_PARAMS);
    if (!result) {
      return null;
    }
    const byTitle = new Map(Object.values(result.pages).map((page) => [page.title, page]));
    for (const title of chunk.titles) {
      const imageinfo = byTitle.get(result.resolveTitle(title))?.imageinfo?.[0];
      info.set(
        title.slice('File:'.length),
        imageinfo?.url ? { source: imageinfo.url, width: imageinfo.width, height: imageinfo.height } : null
      );
    }
  }

  return info;
}

/**
 * True when a wiki file is named after the decoration ("Wolf Totem (decoration) active.jpg" for
 * "Wolf Totem"). Some infoboxes borrow another decoration's image for a shared model, marked
 * "replace with dedicated image", while the decoration's own file already exists.
 */
export function isOwnWikiImage(fileName, decorationName) {
  const key = (value) => normalizeWikiFileName(value).replace(/:/g, '-').toLowerCase();
  const name = key(wikiLookupName(decorationName));
  return Boolean(name) && key(fileName).startsWith(name);
}

/** Pages in the order their infobox images are tried: the stored page, then as selectWikiPage prefers. */
function infoboxPageOrder({ pages, storedPage }) {
  const rank = (page) => {
    if (page === storedPage) return 0;
    if (page.title.includes('Handiwork')) return 1;
    if (page.title.includes('Decoration')) return 2;
    return 3;
  };
  return [...pages].sort((left, right) => rank(left) - rank(right));
}

/**
 * Pick each decoration's preview from its pages' infobox galleries: the first image that exists,
 * trying the stored page first, and images named after the decoration (isOwnWikiImage) before
 * borrowed ones. Sets lookup.infoboxImage to { page, slot, file, caption, own, original } or null
 * when no infobox lists an existing image. `names` maps decoration id to its API name.
 *
 * This is what the wiki itself shows first. pageimages can't be relied on for it: it skips
 * images with extreme proportions (tall pillars, long tracks) and can lead with a close-up.
 *
 * Files are checked lazily, a candidate per decoration per request round, and a file pageimages
 * already reported counts as existing. Returns the ids whose file check failed; their lookups
 * are set to null so enrichment keeps their stored data rather than fall back mid-outage.
 */
export async function attachInfoboxImages(lookups, names) {
  const known = new Map();
  for (const lookup of lookups.values()) {
    for (const page of lookup?.pages ?? []) {
      if (page.original?.source) {
        known.set(wikiFileNameFromUrl(page.original.source), {
          source: page.original.source,
          width: page.original.width,
          height: page.original.height,
        });
      }
    }
  }

  const pending = new Map();
  for (const [id, lookup] of lookups) {
    if (!lookup) {
      continue;
    }
    const images = infoboxPageOrder(lookup).flatMap((page) =>
      infoboxGalleryImages(page).map((image) => ({
        ...image,
        page: page.title,
        own: isOwnWikiImage(image.file, names.get(id) ?? ''),
      }))
    );
    const candidates = [...images.filter((image) => image.own), ...images.filter((image) => !image.own)];
    lookup.infoboxImage = null;
    pending.set(id, { lookup, candidates, next: 0 });
  }

  const failed = [];
  for (let round = 0; round <= INFOBOX_GALLERY_SLOTS * 4 && pending.size > 0; round += 1) {
    const toCheck = new Set();
    for (const [id, state] of pending) {
      while (state.next < state.candidates.length && known.get(state.candidates[state.next].file) === null) {
        state.next += 1;
      }
      const candidate = state.candidates[state.next];
      if (!candidate) {
        pending.delete(id);
      } else if (known.has(candidate.file)) {
        state.lookup.infoboxImage = { ...candidate, original: known.get(candidate.file) };
        pending.delete(id);
      } else {
        toCheck.add(candidate.file);
      }
    }
    if (toCheck.size === 0) {
      continue;
    }

    const info = await fetchWikiFileInfoBatch([...toCheck]);
    if (!info) {
      for (const [id, state] of pending) {
        if (toCheck.has(state.candidates[state.next].file)) {
          lookups.set(id, null);
          failed.push(id);
          pending.delete(id);
        }
      }
      continue;
    }
    for (const [file, value] of info) {
      known.set(file, value);
    }
  }

  return failed;
}

/**
 * Fetch the current wikitext of many pages, batched. Returns a Map from each requested title
 * to its wikitext ('' when the page is missing or the request failed).
 */
export async function fetchWikiWikitextBatch(titles) {
  const wikitextByTitle = new Map();
  const unique = [...new Set(titles)];

  for (const chunk of chunkTitles(unique, (title) => [title], WIKITEXT_PARAMS)) {
    const result = await queryWikiTitles(chunk.titles, WIKITEXT_PARAMS);
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
 * Apply one wiki lookup (from lookupWikiPagesBatch, after attachInfoboxImages) to a decoration.
 *
 * The preview is the first existing image in an infobox gallery (lookup.infoboxImage), the one
 * the wiki itself leads with. It replaces the stored image whenever they differ, except that a
 * borrowed image (not named after the decoration) never replaces one that is. The order of
 * pages tried is fixed (stored page first), so this doesn't flip between variant pages, and
 * only decoration infoboxes count, so an unrelated article under a bare title can't supply it.
 *
 * Without an infobox image (no infobox, or none of its files exist), the pageimages lead image
 * is used as before. The stored wikiTitle is often the "(Handiwork)" recipe page while that
 * image comes from another title variant, so images are tracked across all queried pages:
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

  const { pages, storedPage, infoboxImage } = lookup;
  const withImage = pages.filter((page) => page.original?.source);
  const titlePage = storedPage ?? pickPage(withImage.length > 0 ? withImage : pages);
  let next = { ...decoration, wikiTitle: titlePage.title };
  const currentRemote = remoteOriginalSource(decoration);

  if (infoboxImage) {
    next = withoutMissingMarker(next);
    if (currentRemote && wikiImageUrlsMatch(infoboxImage.original.source, currentRemote)) {
      return next;
    }
    if (currentRemote && !infoboxImage.own && isOwnWikiImage(wikiFileNameFromUrl(currentRemote), decoration.name)) {
      // A borrowed image never replaces one named after the decoration.
      return next;
    }
    const where = `"${infoboxImage.file}", gallery slot ${infoboxImage.slot} on "${infoboxImage.page}"`;
    console.log(`Wiki image ${currentRemote ? 'changed' : 'found'} for ${label}: now ${where}`);
    next.original = {
      width: infoboxImage.original.width,
      height: infoboxImage.original.height,
      source: infoboxImage.original.source,
    };
    return next;
  }

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
 * Enrich many decorations from the wiki: batched page lookups (images, infobox, wikiTitle),
 * batched file checks for infobox images, then batched wikitext fetches for the ones still
 * missing a recipe. Returns a Map from id to the enriched decoration; a decoration whose lookup
 * failed comes back unchanged.
 */
export async function enrichDecorationsFromWiki(decorations) {
  const enriched = new Map();
  const lookups = await lookupWikiPagesBatch(decorations);
  const fileCheckFailures = await attachInfoboxImages(
    lookups,
    new Map(decorations.map((decoration) => [decoration.id, decoration.name]))
  );
  if (fileCheckFailures.length > 0) {
    console.warn(`Wiki file check failed for ${fileCheckFailures.length} decoration(s); keeping their stored data.`);
  }

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
      const noImages = !lookup.infoboxImage && lookup.pages.every((page) => !page.original?.source);
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
