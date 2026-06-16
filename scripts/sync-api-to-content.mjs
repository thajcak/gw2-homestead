import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyEventsToItem,
  listContentIds,
  loadContentMap,
  mergeCategoryUpdate,
  mergeDecorationUpdate,
  remoteOriginalSource,
  writeContentFile,
} from './lib/content-store.mjs';
import {
  generateCategoryEvents,
  generateDecorationEvents,
  groupEventsById,
} from './lib/changelog-events.mjs';

function resolveRepoPath(repoRoot, targetPath) {
  return isAbsolute(targetPath) ? targetPath : join(repoRoot, targetPath);
}

function readApiArray(arrayFile) {
  return JSON.parse(readFileSync(arrayFile, 'utf8'));
}

function syncCollection({
  apiItems,
  existingItems,
  contentDir,
  events,
  day,
  mergeUpdate,
  markRemoved,
}) {
  const eventsById = groupEventsById(events);
  const apiIds = new Set(apiItems.map((item) => item.id));
  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const apiItem of apiItems) {
    const existing = existingItems.get(apiItem.id);
    const itemEvents = eventsById.get(apiItem.id) ?? [];
    const nextItem = mergeUpdate(existing, apiItem);
    applyEventsToItem(nextItem, itemEvents, day);
    writeContentFile(contentDir, nextItem);

    if (!existing) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  for (const id of listContentIds(contentDir)) {
    if (apiIds.has(id)) {
      continue;
    }

    const existing = existingItems.get(id) ?? null;
    if (!existing || existing.removed) {
      continue;
    }

    const itemEvents = eventsById.get(id) ?? [];
    const nextItem = markRemoved(existing);
    applyEventsToItem(nextItem, itemEvents, day);
    writeContentFile(contentDir, nextItem);
    removed += 1;
  }

  return { created, updated, removed };
}

function main() {
  const day = process.argv[2];
  const decorationsApiFile = process.argv[3];
  const categoriesApiFile = process.argv[4];
  const decorationsDir = process.argv[5];
  const categoriesDir = process.argv[6];

  if (!day || !decorationsApiFile || !categoriesApiFile || !decorationsDir || !categoriesDir) {
    console.error(
      'Usage: node scripts/sync-api-to-content.mjs <utc-day> <decorations-api.json> <categories-api.json> <decorations-dir> <categories-dir>'
    );
    process.exit(1);
  }

  const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const decorationsApiPath = resolveRepoPath(repoRoot, decorationsApiFile);
  const categoriesApiPath = resolveRepoPath(repoRoot, categoriesApiFile);
  const decorationsContentDir = resolveRepoPath(repoRoot, decorationsDir);
  const categoriesContentDir = resolveRepoPath(repoRoot, categoriesDir);

  const apiDecorations = readApiArray(decorationsApiPath);
  const apiCategories = readApiArray(categoriesApiPath);
  const existingDecorations = loadContentMap(decorationsContentDir);
  const existingCategories = loadContentMap(categoriesContentDir);

  const decorationEvents = generateDecorationEvents({
    existingDecorations,
    apiDecorations,
    remoteOriginalSource,
  });
  const categoryEvents = generateCategoryEvents({
    existingCategories,
    apiCategories,
  });

  const decorationResult = syncCollection({
    apiItems: apiDecorations,
    existingItems: existingDecorations,
    contentDir: decorationsContentDir,
    events: decorationEvents,
    day,
    mergeUpdate: mergeDecorationUpdate,
    markRemoved: (item) => ({ ...item, removed: true }),
  });

  const categoryResult = syncCollection({
    apiItems: apiCategories,
    existingItems: existingCategories,
    contentDir: categoriesContentDir,
    events: categoryEvents,
    day,
    mergeUpdate: mergeCategoryUpdate,
    markRemoved: (item) => ({ ...item, removed: true }),
  });

  console.log(
    [
      `Synced ${day}:`,
      `${decorationEvents.length} decoration events (${decorationResult.created} created, ${decorationResult.updated} updated, ${decorationResult.removed} removed)`,
      `${categoryEvents.length} category events (${categoryResult.created} created, ${categoryResult.updated} updated, ${categoryResult.removed} removed)`,
    ].join(' ')
  );
}

main();
