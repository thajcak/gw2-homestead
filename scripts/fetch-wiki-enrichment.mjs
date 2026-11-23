/**
 * Wiki enrichment (titles, preview images, recipes) for the decorations in a work file.
 *
 * By default only part of the catalog is checked each run, so the scheduled sync stays light on
 * the wiki:
 * - new decorations (no wikiTitle yet) are always looked up;
 * - the rest are re-checked on a rotation: each run takes the decorations whose
 *   id % WIKI_ROTATION_SLOTS equals the run's slot, so every decoration is re-checked once per
 *   WIKI_ROTATION_SLOTS runs.
 * The slot comes from --rotation-slot, else GITHUB_RUN_NUMBER (counts every run, so skipped
 * schedule ticks don't skip slots), else the current UTC hour count.
 *
 * --ids limits the lookup to those IDs; --all checks every decoration.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichDecorationsFromWiki } from './lib/wiki-api.mjs';

export const WIKI_ROTATION_SLOTS = 24;

function parseArgs(argv) {
  const options = {
    arrayFile: null,
    ids: null,
    all: false,
    rotationSlot: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ids') {
      options.ids = new Set(
        argv[index + 1]
          .split(',')
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value))
      );
      index += 1;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--rotation-slot') {
      options.rotationSlot = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('-')) {
      options.arrayFile = arg;
    }
  }

  return options;
}

function currentRotationSlot(explicit) {
  const runNumber = Number.parseInt(process.env.GITHUB_RUN_NUMBER ?? '', 10);
  const counter = Number.isFinite(explicit)
    ? explicit
    : Number.isFinite(runNumber)
      ? runNumber
      : Math.floor(Date.now() / 3_600_000);
  return ((counter % WIKI_ROTATION_SLOTS) + WIKI_ROTATION_SLOTS) % WIKI_ROTATION_SLOTS;
}

function selectDecorations(decorations, options) {
  if (options.ids) {
    return { selected: decorations.filter((decoration) => options.ids.has(decoration.id)), summary: 'requested IDs' };
  }
  if (options.all) {
    return { selected: decorations, summary: 'all decorations' };
  }

  const slot = currentRotationSlot(options.rotationSlot);
  const isNew = (decoration) => !decoration.wikiTitle;
  const selected = decorations.filter(
    (decoration) => isNew(decoration) || decoration.id % WIKI_ROTATION_SLOTS === slot
  );
  const newCount = selected.filter(isNew).length;
  return {
    selected,
    summary: `${newCount} new + ${selected.length - newCount} from rotation slot ${slot}/${WIKI_ROTATION_SLOTS}`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.arrayFile) {
    console.error(
      'Usage: node scripts/fetch-wiki-enrichment.mjs <decorations-array.json> [--ids 884,885 | --all | --rotation-slot N] [--dry-run]'
    );
    process.exit(1);
  }

  const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const arrayPath = isAbsolute(options.arrayFile)
    ? options.arrayFile
    : join(repoRoot, options.arrayFile);
  const decorations = JSON.parse(readFileSync(arrayPath, 'utf8'));
  const { selected, summary } = selectDecorations(decorations, options);

  if (selected.length === 0) {
    if (options.ids) {
      console.error('No decorations matched the requested filter.');
      process.exit(1);
    }
    console.log('No decorations to check on the wiki this run.');
    return;
  }

  console.log(`Checking ${selected.length} decoration(s) on the wiki (${summary}).`);
  const enrichedById = await enrichDecorationsFromWiki(selected);
  const nextDecorations = decorations.map(
    (decoration) => enrichedById.get(decoration.id) ?? decoration
  );

  if (options.dryRun) {
    for (const decoration of selected) {
      const enriched = enrichedById.get(decoration.id);
      console.log(
        JSON.stringify(
          {
            id: enriched.id,
            name: enriched.name,
            wikiTitle: enriched.wikiTitle ?? null,
            hasOriginal: enriched.original != null,
            hasRecipe: enriched.recipe != null,
          },
          null,
          2
        )
      );
    }
    return;
  }

  writeFileSync(arrayPath, `${JSON.stringify(nextDecorations, null, 2)}\n`);
  console.log(`Updated wiki enrichment for ${selected.length} decoration(s) in ${options.arrayFile}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
