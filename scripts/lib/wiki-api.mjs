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

function isThrottleError(error, status) {
  if (status === 403 || status === 429) {
    return true;
  }
  const message = String(error?.message ?? '');
  return /rate limit|ratelimit|too many requests|maxlag|http 403|http 429/i.test(message);
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
      const response = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        headers: { 'User-Agent': WIKI_USER_AGENT },
      });
      status = response.status;
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (/ratelimit|rate limit|too many requests|maxlag/i.test(text)) {
        throw new Error('rate limited');
      }

      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      lastStatus = status ?? lastStatus;
      if (attempt < maxAttempts) {
        const throttled = isThrottleError(error, status);
        const waitMs = throttled ? sleepMs * attempt * 2 : sleepMs;
        console.warn(`Wiki fetch attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
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

/**
 * Ask the wiki about the stored wikiTitle and every title variant in one request (redirects
 * followed). Returns null when the request failed, else { pages, storedPage }: the valid pages,
 * and the page the stored wikiTitle resolves to (null if it no longer exists).
 */
export async function lookupWikiPages(decoration) {
  const titles = [
    ...new Set([
      ...(decoration.wikiTitle ? [decoration.wikiTitle] : []),
      ...buildWikiTitleVariants(decoration.name),
    ]),
  ];
  const titlesParam = titles.map((title) => encodeURIComponent(title)).join('|');
  const url = `${WIKI_API}?action=query&titles=${titlesParam}&redirects=1&prop=pageimages&piprop=original&format=json&origin=*`;
  const data = await tryFetchJson(url, 5, 2000);
  if (!data?.query) {
    return null;
  }

  const aliases = new Map();
  for (const { from, to } of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
    aliases.set(from, to);
  }
  const resolveTitle = (title) => {
    let current = title;
    for (let hops = 0; hops < 5 && aliases.has(current); hops += 1) {
      current = aliases.get(current);
    }
    return current;
  };

  const pages = listValidWikiPages(data.query.pages);
  const storedTitle = decoration.wikiTitle ? resolveTitle(decoration.wikiTitle) : null;
  const storedPage = storedTitle ? (pages.find((page) => page.title === storedTitle) ?? null) : null;
  return { pages, storedPage };
}

export async function fetchWikiWikitext(title) {
  const encoded = encodeURIComponent(title);
  const url = `${WIKI_API}?action=query&titles=${encoded}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`;
  const data = await tryFetchJson(url, 5, 2000);
  const page = Object.values(data?.query?.pages ?? {})[0];

  if (!page || page.missing || page.invalid) {
    return '';
  }

  return page.revisions?.[0]?.slots?.main?.['*'] ?? '';
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

export async function applyWikiRecipeIfNeeded(decoration) {
  if (!decoration.wikiTitle || decoration.recipe != null) {
    return decoration;
  }

  const wikitext = await fetchWikiWikitext(decoration.wikiTitle);
  if (!wikitext) {
    return decoration;
  }

  const recipe = wikitextToRecipeJson(wikitext);
  if (!recipe) {
    return decoration;
  }

  return { ...decoration, recipe };
}

function withoutMissingMarker(decoration) {
  const { previewMissingSince: _previewMissingSince, ...rest } = decoration;
  return rest;
}

/**
 * Apply one wiki lookup (from lookupWikiPages) to a decoration.
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

export async function enrichDecorationFromWiki(decoration) {
  const lookupName = wikiLookupName(decoration.name);
  const displayId = decoration.id;

  try {
    console.log(`Processing decoration: ${lookupName} (ID: ${displayId})`);

    const lookup = await lookupWikiPages(decoration);
    if (!lookup) {
      console.warn(`Wiki lookup failed for decoration ${lookupName} (ID: ${displayId}); keeping stored data.`);
      return decoration;
    }
    if (lookup.pages.length === 0) {
      console.warn(`No valid wiki page found for decoration ${lookupName} (ID: ${displayId})`);
    }

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

    return applyWikiRecipeIfNeeded(applyWikiImageMetadata(decoration, lookup));
  } catch (error) {
    console.warn(`Wiki enrichment failed for ${lookupName} (ID: ${displayId}): ${error.message}`);
    return decoration;
  }
}

export const WIKI_REQUEST_DELAY_MS = 150;

export async function waitForWikiRequestSlot() {
  await sleep(WIKI_REQUEST_DELAY_MS);
}
