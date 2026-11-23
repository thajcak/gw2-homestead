/**
 * One-off history cleanup (safe to re-run).
 *
 * 1. Leaked category events: the old pipeline wrote category history into the decoration with
 *    the same numeric ID (decorations 1–27). Those entries carry a category's name, e.g.
 *    Potted Sprouting Night Thistle (ID 1) holds eight "New Item: Architecture" entries. They
 *    are moved to the matching category file.
 * 2. Duplicate "New Item" entries: only the earliest is kept for each decoration and category,
 *    so Recently Added shows an item on the day it actually first appeared.
 *
 * Usage: node scripts/cleanup-history.mjs [--dry-run]
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendHistory, loadContentMap, writeContentFile } from './lib/content-store.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsDir = join(repoRoot, 'src/content/decorations');
const categoriesDir = join(repoRoot, 'src/content/categories');

function keepEarliestNewItem(history) {
  const newItems = history.filter((entry) => entry.type === 'New Item');
  if (newItems.length <= 1) {
    return { history, dropped: 0 };
  }

  const earliest = newItems.reduce((first, entry) => (entry.day < first.day ? entry : first));
  return {
    history: history.filter((entry) => entry.type !== 'New Item' || entry === earliest),
    dropped: newItems.length - 1,
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const decorations = loadContentMap(decorationsDir);
  const categories = loadContentMap(categoriesDir);
  const categoryNames = new Set([...categories.values()].map((category) => category.name));

  const changedDecorations = new Set();
  const changedCategories = new Set();
  let movedEntries = 0;
  let droppedDecorationDuplicates = 0;
  let droppedCategoryDuplicates = 0;

  for (const decoration of decorations.values()) {
    const history = decoration.history ?? [];
    const category = categories.get(decoration.id);

    if (category) {
      const leaked = history.filter(
        (entry) => entry.name !== decoration.name && categoryNames.has(entry.name)
      );
      if (leaked.length > 0) {
        decoration.history = history.filter((entry) => !leaked.includes(entry));
        for (const entry of leaked) {
          appendHistory(category, entry);
        }
        movedEntries += leaked.length;
        changedDecorations.add(decoration.id);
        changedCategories.add(category.id);
      }
    }

    const { history: deduped, dropped } = keepEarliestNewItem(decoration.history ?? []);
    if (dropped > 0) {
      decoration.history = deduped;
      droppedDecorationDuplicates += dropped;
      changedDecorations.add(decoration.id);
    }
  }

  for (const category of categories.values()) {
    const { history: deduped, dropped } = keepEarliestNewItem(category.history ?? []);
    if (dropped > 0) {
      category.history = deduped;
      droppedCategoryDuplicates += dropped;
      changedCategories.add(category.id);
    }
  }

  console.log(
    [
      `${dryRun ? '[dry run] ' : ''}Moved ${movedEntries} leaked category entries out of decorations.`,
      `Dropped ${droppedDecorationDuplicates} duplicate decoration "New Item" entries and ${droppedCategoryDuplicates} duplicate category ones.`,
      `${changedDecorations.size} decoration files and ${changedCategories.size} category files changed.`,
    ].join('\n')
  );

  if (dryRun) {
    return;
  }

  for (const id of changedDecorations) {
    writeContentFile(decorationsDir, decorations.get(id));
  }
  for (const id of changedCategories) {
    writeContentFile(categoriesDir, categories.get(id));
  }
}

main();
