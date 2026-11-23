/**
 * Write the enriched API data into the content files and log what changed.
 *
 * Item files hold current state: a new item gets `added: <day>`, a confirmed removal gets
 * `removed: <day>`. Every real change (new, updated with before/after, removed, returned) is
 * appended to the month's change log in src/data/changes/.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendChanges } from './lib/change-log.mjs';
import { changeEntry, diffCategory, diffDecoration } from './lib/changelog-events.mjs';
import {
  listContentIds,
  loadContentMap,
  mergeCategoryUpdate,
  mergeDecorationUpdate,
  writeContentFile,
} from './lib/content-store.mjs';

function resolveRepoPath(repoRoot, targetPath) {
  return isAbsolute(targetPath) ? targetPath : join(repoRoot, targetPath);
}

function readApiArray(arrayFile) {
  return JSON.parse(readFileSync(arrayFile, 'utf8'));
}

function syncCollection({ collection, apiItems, existingItems, contentDir, day, mergeUpdate, diff }) {
  const changes = [];
  const apiIds = new Set(apiItems.map((item) => item.id));
  const counts = { created: 0, updated: 0, returned: 0, removed: 0, missing: 0 };

  for (const apiItem of apiItems) {
    const existing = existingItems.get(apiItem.id);
    const nextItem = mergeUpdate(existing, apiItem);

    if (!existing) {
      nextItem.added = day;
      changes.push(changeEntry({ day, collection, item: nextItem, type: 'New Item' }));
      counts.created += 1;
    } else {
      if (existing.removed) {
        changes.push(changeEntry({ day, collection, item: nextItem, type: 'Item Returned' }));
        counts.returned += 1;
      }
      const fieldChanges = diff(existing, nextItem);
      if (fieldChanges.length > 0) {
        changes.push(changeEntry({ day, collection, item: nextItem, type: 'Item Updated', changes: fieldChanges }));
        counts.updated += 1;
      }
    }

    writeContentFile(contentDir, nextItem);
  }

  for (const id of listContentIds(contentDir)) {
    const existing = existingItems.get(id);
    if (apiIds.has(id) || !existing || existing.removed) {
      continue;
    }

    if (!existing.missingSince) {
      // First run without this item: remember it, but don't remove it yet.
      writeContentFile(contentDir, { ...existing, missingSince: day });
      counts.missing += 1;
      continue;
    }

    const { missingSince: _missingSince, ...rest } = existing;
    const removedItem = { ...rest, removed: day };
    writeContentFile(contentDir, removedItem);
    changes.push(changeEntry({ day, collection, item: removedItem, type: 'Item Removed' }));
    counts.removed += 1;
  }

  return { changes, counts };
}

function summary(label, { counts }) {
  return `${label}: ${counts.created} new, ${counts.updated} updated, ${counts.returned} returned, ${counts.removed} removed, ${counts.missing} newly missing`;
}

function main() {
  const [day, decorationsApiFile, categoriesApiFile, decorationsDir, categoriesDir, changesDir = 'src/data/changes'] =
    process.argv.slice(2);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '') || !decorationsApiFile || !categoriesApiFile || !decorationsDir || !categoriesDir) {
    console.error(
      'Usage: node scripts/sync-api-to-content.mjs <utc-day> <decorations-api.json> <categories-api.json> <decorations-dir> <categories-dir> [changes-dir]'
    );
    process.exit(1);
  }

  const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const decorationsContentDir = resolveRepoPath(repoRoot, decorationsDir);
  const categoriesContentDir = resolveRepoPath(repoRoot, categoriesDir);

  const decorations = syncCollection({
    collection: 'decorations',
    apiItems: readApiArray(resolveRepoPath(repoRoot, decorationsApiFile)),
    existingItems: loadContentMap(decorationsContentDir),
    contentDir: decorationsContentDir,
    day,
    mergeUpdate: mergeDecorationUpdate,
    diff: diffDecoration,
  });

  const categories = syncCollection({
    collection: 'categories',
    apiItems: readApiArray(resolveRepoPath(repoRoot, categoriesApiFile)),
    existingItems: loadContentMap(categoriesContentDir),
    contentDir: categoriesContentDir,
    day,
    mergeUpdate: mergeCategoryUpdate,
    diff: diffCategory,
  });

  const logged = appendChanges(resolveRepoPath(repoRoot, changesDir), [...categories.changes, ...decorations.changes]);

  console.log(`Synced ${day}. ${summary('Decorations', decorations)}. ${summary('Categories', categories)}. ${logged} change(s) logged.`);
}

main();
