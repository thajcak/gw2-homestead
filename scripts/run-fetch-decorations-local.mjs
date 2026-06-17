import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WORK_DIR = join(repoRoot, '.local-sync');

function parseArgs(argv) {
  const options = {
    ids: null,
    skipSync: false,
    skipLocalize: false,
    dryRun: false,
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

async function fetchGw2Collection(endpoint) {
  const listResponse = await fetch(`https://api.guildwars2.com/v2/${endpoint}`);
  const ids = await listResponse.json();
  const chunkSize = 200;
  const items = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize).join(',');
    const response = await fetch(`https://api.guildwars2.com/v2/${endpoint}?ids=${chunk}`);
    const batch = await response.json();
    items.push(...batch);
  }

  return items;
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
  writeFileSync(decorationsPath, `${JSON.stringify(decorations, null, 2)}\n`);
  writeFileSync(categoriesPath, `${JSON.stringify(categories, null, 2)}\n`);

  console.log('Merging existing enrichment from content files...');
  run('node', ['scripts/merge-existing-enrichment.mjs', decorationsPath, 'src/content/decorations']);

  const wikiArgs = [join(decorationsPath)];
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

  console.log('Local fetch-decorations run complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
