import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import { listContentIds, loadContentMap, mergeEnrichmentFromExisting } from './lib/content-store.mjs';

function main() {
  const arrayFile = process.argv[2];
  const contentDir = process.argv[3];

  if (!arrayFile || !contentDir) {
    console.error('Usage: node scripts/merge-existing-enrichment.mjs <api-array.json> <content-dir>');
    process.exit(1);
  }

  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const arrayPath = isAbsolute(arrayFile) ? arrayFile : join(repoRoot, arrayFile);
  const contentPath = isAbsolute(contentDir) ? contentDir : join(repoRoot, contentDir);
  const apiItems = JSON.parse(readFileSync(arrayPath, 'utf8'));
  const existingById = loadContentMap(contentPath);
  const knownIds = new Set(listContentIds(contentPath));

  let mergedCount = 0;
  const enriched = apiItems.map((apiItem) => {
    if (!knownIds.has(apiItem.id)) {
      return apiItem;
    }

    const existing = existingById.get(apiItem.id);
    const merged = mergeEnrichmentFromExisting(apiItem, existing);
    if (JSON.stringify(merged) !== JSON.stringify(apiItem)) {
      mergedCount += 1;
    }
    return merged;
  });

  writeFileSync(arrayPath, `${JSON.stringify(enriched, null, 2)}\n`);
  console.log(`Merged enrichment from ${knownIds.size} existing files into ${arrayFile} (${mergedCount} updated).`);
}

main();
