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

export function selectWikiPage(pages) {
  let fallback = null;

  for (const [pageId, page] of Object.entries(pages ?? {})) {
    if (pageId.startsWith('-') || page.missing || page.invalid) {
      continue;
    }

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

export async function fetchRdfAppearanceUrl(pageTitle) {
  const rdfTitle = pageTitle.replace(/ /g, '_');
  const url = `https://wiki.guildwars2.com/index.php?title=Special:ExportRDF/${encodeURIComponent(rdfTitle)}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(45000),
      headers: { 'User-Agent': WIKI_USER_AGENT },
    });

    if (!response.ok) {
      return null;
    }

    const rdfData = await response.text();
    const xmlstarlet = spawnSync(
      'xmlstarlet',
      [
        'sel',
        '-N',
        'rdf=http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        '-N',
        'property1=http://wiki-en.guildwars2.com/wiki/Special:URIResolver/Property-3A',
        '-N',
        'property2=http://wiki.guildwars2.com/wiki/Special:URIResolver/Property-3A',
        '-t',
        '-v',
        '//property1:Has_appearance/@rdf:resource',
        '-o',
        ' ',
        '-v',
        '//property2:Has_appearance/@rdf:resource',
      ],
      { input: rdfData, encoding: 'utf8' }
    );

    if (xmlstarlet.status !== 0) {
      return null;
    }

    const tempFilename = xmlstarlet.stdout.trim();
    if (!tempFilename) {
      return null;
    }

    const truncatedFilename = tempFilename.split('/').pop() ?? '';
    const filenameTitle = encodeURIComponent(truncatedFilename.replace(/-3A/g, ':'));
    const imageData = await queryWikiPages([decodeURIComponent(filenameTitle)]);
    const page = selectWikiPage(imageData);
    return page?.original ?? null;
  } catch (error) {
    console.warn(`RDF appearance lookup failed for ${pageTitle}: ${error.message}`);
    return null;
  }
}

async function resolveWikiPage(decoration) {
  if (decoration.wikiTitle) {
    const pages = await queryWikiPages([decoration.wikiTitle]);
    const page = selectWikiPage(pages);
    if (page) {
      return page;
    }
  }

  const pages = await queryWikiPages(buildWikiTitleVariants(decoration.name));
  return selectWikiPage(pages);
}

async function resolveWikiOriginal(page) {
  if (page.original) {
    return page.original;
  }

  return fetchRdfAppearanceUrl(page.title);
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

    const page = await resolveWikiPage(decoration);
    if (!page) {
      console.warn(`No valid wiki page found for decoration ${lookupName} (ID: ${displayId})`);
      return applyWikiRecipeIfNeeded(decoration);
    }

    const wikiOriginal = await resolveWikiOriginal(page);
    let next = { ...decoration, wikiTitle: page.title };

    if (wikiOriginal?.source) {
      const currentRemote = remoteOriginalSource(decoration);
      const nextRemote = wikiOriginal.source;

      if (!currentRemote) {
        next = {
          ...next,
          original: {
            width: wikiOriginal.width,
            height: wikiOriginal.height,
            source: nextRemote,
          },
        };
      } else if (!wikiImageUrlsMatch(currentRemote, nextRemote)) {
        console.log(`Wiki image changed for ${lookupName} (ID: ${displayId})`);
        next = {
          ...next,
          original: {
            width: wikiOriginal.width,
            height: wikiOriginal.height,
            source: nextRemote,
          },
        };
      }
    } else {
      console.warn(`No image information found for decoration ${lookupName} (ID: ${displayId})`);
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
