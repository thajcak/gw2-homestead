import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichDecorationFromWiki } from './lib/wiki-api.mjs';

function parseArgs(argv) {
  const options = {
    arrayFile: null,
    ids: null,
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
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('-')) {
      options.arrayFile = arg;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.arrayFile) {
    console.error(
      'Usage: node scripts/fetch-wiki-enrichment.mjs <decorations-array.json> [--ids 884,885] [--dry-run]'
    );
    process.exit(1);
  }

  const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const arrayPath = isAbsolute(options.arrayFile)
    ? options.arrayFile
    : join(repoRoot, options.arrayFile);
  const decorations = JSON.parse(readFileSync(arrayPath, 'utf8'));
  const selected = options.ids
    ? decorations.filter((decoration) => options.ids.has(decoration.id))
    : decorations;

  if (selected.length === 0) {
    console.error('No decorations matched the requested filter.');
    process.exit(1);
  }

  const enrichedById = new Map();
  for (const decoration of selected) {
    enrichedById.set(decoration.id, await enrichDecorationFromWiki(decoration));
  }

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
