/**
 * One-off migration (P5): move per-item `history` arrays into the monthly change log.
 *
 * - Each item gets `added`: the day of its earliest "New Item" entry. Later duplicates are
 *   dropped (the old pipeline re-logged items as new after false removals).
 * - "Item Updated" entries move to the change log as they are; they already carry before and
 *   after values. The exception is 2025-10-30's decoration category entries: that day the API
 *   inserted Visions of Eternity as category 20 and shifted categories 20–26 up by one, so
 *   every one of those entries is an ID shift, not a decoration changing category. They are
 *   dropped after checking that each is exactly that shift.
 * - "Image Updated", "Image Added" and "Recipe Updated" entries are dropped. They record no
 *   before or after value, and nearly all of them are wiki image flips (P1), so the real
 *   changes among them can't be told apart.
 *
 * Items without a `history` array are skipped, so the script is safe to re-run.
 *
 * Usage: node scripts/migrate-history-to-change-log.mjs [--dry-run]
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendChanges } from './lib/change-log.mjs';
import { loadContentMap, writeContentFile } from './lib/content-store.mjs';
import { sanitizeDisplayName } from './lib/sanitize-text.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsDir = join(repoRoot, 'src/content/decorations');
const categoriesDir = join(repoRoot, 'src/content/categories');
const changesDir = join(repoRoot, 'src/data/changes');

const RENUMBER_DAY = '2025-10-30';
const RENUMBERED_IDS = new Set([20, 21, 22, 23, 24, 25, 26]);
const DROPPED_TYPES = new Set(['Image Updated', 'Image Added', 'Recipe Updated']);

/** True when one day's category changes are exactly the 2025-10-30 "+1" ID shift. */
function isRenumberShift(categoryChanges) {
  const byId = (a, b) => a - b;
  const removed = categoryChanges
    .filter((change) => change.before != null && change.after == null)
    .map((change) => change.before)
    .sort(byId);
  const added = categoryChanges
    .filter((change) => change.before == null && change.after != null)
    .map((change) => change.after)
    .sort(byId);
  return (
    removed.length > 0 &&
    removed.length + added.length === categoryChanges.length &&
    removed.every((id) => RENUMBERED_IDS.has(id)) &&
    removed.map((id) => id + 1).join() === added.join()
  );
}

/** Rebuild the item with `added` (and `removed`) right after its core fields, minus history. */
function withDates(item, added, removed) {
  const { history: _history, added: _added, removed: _removed, ...rest } = item;
  const coreKeys = ['id', 'name', 'description', 'categories', 'icon'];
  const next = {};
  for (const key of coreKeys) {
    if (Object.hasOwn(rest, key)) {
      next[key] = rest[key];
    }
  }
  next.added = added;
  if (removed) {
    next.removed = removed;
  }
  for (const [key, value] of Object.entries(rest)) {
    if (!coreKeys.includes(key)) {
      next[key] = value;
    }
  }
  return next;
}

function migrateItem(item, collection, stats) {
  const history = item.history;
  const newItems = history.filter((entry) => entry.type === 'New Item');
  if (newItems.length === 0) {
    throw new Error(`${collection} ${item.id} (${item.name}) has no "New Item" history entry.`);
  }
  const firstNew = newItems.reduce((first, entry) => (entry.day < first.day ? entry : first));
  stats.duplicateNewItems += newItems.length - 1;

  let removed = null;
  if (item.removed === true) {
    const removals = history.filter((entry) => entry.type === 'Item Removed').map((entry) => entry.day).sort();
    removed = removals.at(-1) ?? firstNew.day;
  } else if (typeof item.removed === 'string') {
    removed = item.removed;
  }

  const entries = [
    { day: firstNew.day, collection, id: item.id, type: 'New Item', name: sanitizeDisplayName(firstNew.name) },
  ];

  for (const entry of history) {
    if (entry.type === 'New Item') {
      continue;
    }
    if (DROPPED_TYPES.has(entry.type)) {
      stats.dropped[entry.type] = (stats.dropped[entry.type] ?? 0) + 1;
      continue;
    }

    let changes = entry.changes ?? [];
    if (collection === 'decorations' && entry.day === RENUMBER_DAY) {
      const categoryChanges = changes.filter((change) => change.field === 'categories');
      if (categoryChanges.length > 0) {
        if (!isRenumberShift(categoryChanges)) {
          throw new Error(`Decoration ${item.id}: ${RENUMBER_DAY} category changes are not the expected ID shift.`);
        }
        changes = changes.filter((change) => change.field !== 'categories');
        stats.renumberEntries += categoryChanges.length;
      }
    }
    if (entry.type === 'Item Updated' && changes.length === 0) {
      continue;
    }

    entries.push({
      day: entry.day,
      collection,
      id: item.id,
      type: entry.type,
      name: sanitizeDisplayName(entry.name),
      ...(changes.length ? { changes } : {}),
    });
    stats.kept[entry.type] = (stats.kept[entry.type] ?? 0) + 1;
  }

  return { item: withDates(item, firstNew.day, removed), entries };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const stats = { duplicateNewItems: 0, renumberEntries: 0, dropped: {}, kept: {} };
  const entries = [];
  const writes = [];

  for (const [collection, dir] of [
    ['decorations', decorationsDir],
    ['categories', categoriesDir],
  ]) {
    for (const item of loadContentMap(dir).values()) {
      if (!Array.isArray(item.history)) {
        continue;
      }
      const migrated = migrateItem(item, collection, stats);
      entries.push(...migrated.entries);
      writes.push([dir, migrated.item]);
    }
  }

  const logged = dryRun ? entries.length : appendChanges(changesDir, entries);
  if (!dryRun) {
    for (const [dir, item] of writes) {
      writeContentFile(dir, item);
    }
  }

  const format = (counts) =>
    Object.entries(counts)
      .map(([type, count]) => `${count} "${type}"`)
      .join(', ') || 'none';
  console.log(
    [
      `${dryRun ? '[dry run] ' : ''}Migrated ${writes.length} item files; ${logged} change log entries written.`,
      `Kept: ${entries.length - Object.values(stats.kept).reduce((a, b) => a + b, 0)} "New Item", ${format(stats.kept)}.`,
      `Dropped: ${stats.duplicateNewItems} duplicate "New Item", ${format(stats.dropped)}, and ${stats.renumberEntries} category-renumbering changes from ${RENUMBER_DAY}.`,
    ].join('\n')
  );
}

main();
