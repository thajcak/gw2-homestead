/**
 * Full decoration sync: GW2 API -> merge stored enrichment -> wiki enrichment -> content files
 * -> local images. Used by the scheduled GitHub workflow and by `npm run fetch-decorations`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentMap } from './lib/content-store.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WORK_DIR = join(repoRoot, '.local-sync');

function parseArgs(argv) {
  const options = {
    ids: null,
    skipSync: false,
    skipLocalize: false,
    dryRun: false,
    allowLargeDrop: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ids') {
      options.ids = argv[index + 1];
      index += 1;
    } else if (arg === '--skip-sync') {
      options.skipSync = true;
    } else if (arg === '--skip-localize') {
      options.skipLocalize = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--allow-large-drop') {
      options.allowLargeDrop = true;
    }
  }

  return options;
}

function run(command, args, { cwd = repoRoot } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

const GW2_API = 'https://api.guildwars2.com/v2';
const FETCH_ATTEMPTS = 4;
const CHUNK_SIZE = 200;
/** Abort when the API lists more than this many fewer items than we have stored... */
const MAX_DROP_ITEMS = 10;
/** ...or more than this share of them, whichever is smaller (but always allow one). */
const MAX_DROP_RATIO = 0.02;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        console.warn(`GW2 API attempt ${attempt}/${FETCH_ATTEMPTS} failed for ${url}: ${error.message}`);
        await sleep(attempt * 2000);
      }
    }
  }
  throw new Error(`GW2 API request failed after ${FETCH_ATTEMPTS} attempts: ${url} (${lastError?.message})`);
}

/**
 * Fetch every item of a GW2 API collection, or throw. A partial answer (the API replies
 * 206 Partial Content when some IDs fail, which still counts as response.ok) is retried and
 * then treated as a failure, never passed on as if those items were removed.
 */
async function fetchGw2Collection(endpoint) {
  const ids = await fetchJson(`${GW2_API}/${endpoint}`);
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isInteger)) {
    throw new Error(`Unexpected ID list from /${endpoint}: ${JSON.stringify(ids).slice(0, 200)}`);
  }

  const items = [];
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const chunkIds = ids.slice(index, index + CHUNK_SIZE);
    const url = `${GW2_API}/${endpoint}?ids=${chunkIds.join(',')}`;
    let batch;

    for (let attempt = 1; ; attempt += 1) {
      batch = await fetchJson(url);
      const returned = new Set(Array.isArray(batch) ? batch.map((item) => item?.id) : []);
      const missing = chunkIds.filter((id) => !returned.has(id));
      if (missing.length === 0) {
        break;
      }
      if (attempt >= FETCH_ATTEMPTS) {
        throw new Error(
          `/${endpoint} returned ${returned.size} of ${chunkIds.length} requested items; missing ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''}`
        );
      }
      console.warn(`/${endpoint} chunk was missing ${missing.length} item(s); retrying.`);
      await sleep(attempt * 2000);
    }

    items.push(...batch);
  }

  return items;
}

/** Refuse to continue when the API suddenly lists far fewer items than we have stored. */
function assertNoLargeDrop(label, apiItems, contentDir, allowLargeDrop) {
  const storedCount = [...loadContentMap(contentDir).values()].filter((item) => !item.removed).length;
  const drop = storedCount - apiItems.length;
  const limit = Math.min(MAX_DROP_ITEMS, Math.max(1, Math.floor(storedCount * MAX_DROP_RATIO)));

  if (drop <= limit) {
    return;
  }

  const message = `GW2 API lists ${apiItems.length} ${label}, ${drop} fewer than the ${storedCount} stored (limit ${limit}).`;
  if (allowLargeDrop) {
    console.warn(`${message} Continuing because --allow-large-drop was passed.`);
    return;
  }
  throw new Error(`${message} Aborting in case the API answered partially; rerun with --allow-large-drop if this is real.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(WORK_DIR, { recursive: true });
  mkdirSync(join(repoRoot, 'src/content/decorations'), { recursive: true });
  mkdirSync(join(repoRoot, 'src/content/categories'), { recursive: true });

  const decorationsPath = join(WORK_DIR, 'decorations_work.json');
  const categoriesPath = join(WORK_DIR, 'categories_work.json');

  console.log('Fetching GW2 API data...');
  const decorations = await fetchGw2Collection('homestead/decorations');
  const categories = await fetchGw2Collection('homestead/decorations/categories');
  assertNoLargeDrop('decorations', decorations, join(repoRoot, 'src/content/decorations'), options.allowLargeDrop);
  assertNoLargeDrop('categories', categories, join(repoRoot, 'src/content/categories'), options.allowLargeDrop);
  console.log(`Fetched ${decorations.length} decorations and ${categories.length} categories.`);
  writeFileSync(decorationsPath, `${JSON.stringify(decorations, null, 2)}\n`);
  writeFileSync(categoriesPath, `${JSON.stringify(categories, null, 2)}\n`);

  console.log('Merging existing enrichment from content files...');
  run('node', ['scripts/merge-existing-enrichment.mjs', decorationsPath, 'src/content/decorations']);

  const wikiArgs = [decorationsPath];
  if (options.ids) {
    wikiArgs.push('--ids', options.ids);
  }
  if (options.dryRun) {
    wikiArgs.push('--dry-run');
  }

  console.log('Fetching wiki titles, images, and recipes...');
  run('node', ['scripts/fetch-wiki-enrichment.mjs', ...wikiArgs]);

  if (options.dryRun || options.skipSync) {
    console.log('Dry run complete. Work files are in .local-sync/');
    return;
  }

  const utcDay = new Date().toISOString().slice(0, 10);
  console.log(`Syncing API data into content files for ${utcDay}...`);
  run('node', [
    'scripts/sync-api-to-content.mjs',
    utcDay,
    decorationsPath,
    categoriesPath,
    'src/content/decorations',
    'src/content/categories',
  ]);

  if (!options.skipLocalize) {
    console.log('Localizing decoration images...');
    run('node', ['scripts/localize-decoration-images.mjs', 'src/content/decorations']);
  }

  console.log('fetch-decorations run complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
