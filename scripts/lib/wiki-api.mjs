import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remoteOriginalSource } from './content-store.mjs';
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

function findWikiPreviewPage(pages) {
  const withImage = listValidWikiPages(pages).filter((page) => page.original?.source);
  if (withImage.length === 0) {
    return null;
  }

  const pagesById = Object.fromEntries(withImage.map((page, index) => [String(index), page]));
  return selectWikiPage(pagesById);
}

async function resolveWikiImageMetadata(decoration) {
  const titles = [
    ...new Set([
      ...(decoration.wikiTitle ? [decoration.wikiTitle] : []),
      ...buildWikiTitleVariants(decoration.name),
    ]),
  ];

  const pages = await queryWikiPages(titles);
  const previewPage = findWikiPreviewPage(pages);
  if (previewPage) {
    return {
      status: 'has-preview',
      wikiTitle: previewPage.title,
      original: previewPage.original,
    };
  }

  const page = selectWikiPage(pages);
  if (!page) {
    return { status: 'no-page' };
  }

  return {
    status: 'no-preview',
    wikiTitle: page.title,
    original: null,
  };
}

export async function queryWikiPages(titles) {
  const titlesParam = titles.map((title) => encodeURIComponent(title)).join('|');
  const url = `${WIKI_API}?action=query&titles=${titlesParam}&prop=pageimages&piprop=original&format=json&origin=*`;
  const data = await tryFetchJson(url, 5, 2000);
  return data?.query?.pages ?? {};
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

export async function enrichDecorationFromWiki(decoration) {
  const lookupName = wikiLookupName(decoration.name);
  const displayId = decoration.id;

  try {
    console.log(`Processing decoration: ${lookupName} (ID: ${displayId})`);

    const metadata = await resolveWikiImageMetadata(decoration);
    if (metadata.status === 'no-page') {
      console.warn(`No valid wiki page found for decoration ${lookupName} (ID: ${displayId})`);
      return applyWikiRecipeIfNeeded(decoration);
    }

    let next = { ...decoration, wikiTitle: metadata.wikiTitle };

    if (metadata.status === 'has-preview' && metadata.original?.source) {
      const currentRemote = remoteOriginalSource(decoration);
      const nextRemote = metadata.original.source;

      if (!currentRemote) {
        next = {
          ...next,
          original: {
            width: metadata.original.width,
            height: metadata.original.height,
            source: nextRemote,
          },
        };
      } else if (!wikiImageUrlsMatch(currentRemote, nextRemote)) {
        console.log(`Wiki image changed for ${lookupName} (ID: ${displayId})`);
        next = {
          ...next,
          original: {
            width: metadata.original.width,
            height: metadata.original.height,
            source: nextRemote,
          },
        };
      }
    } else {
      console.warn(`No wiki preview available for decoration ${lookupName} (ID: ${displayId})`);
      next.original = null;
    }

    return applyWikiRecipeIfNeeded(next);
  } catch (error) {
    console.warn(`Wiki enrichment failed for ${lookupName} (ID: ${displayId}): ${error.message}`);
    return decoration;
  }
}

export const WIKI_REQUEST_DELAY_MS = 150;

export async function waitForWikiRequestSlot() {
  await sleep(WIKI_REQUEST_DELAY_MS);
}
