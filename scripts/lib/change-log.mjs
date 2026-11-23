/**
 * The change log: an append-only record of real changes to decorations and categories, one
 * JSON file per month (src/data/changes/2026-11.json). Item files hold only current state
 * (plus `added` / `removed` days); everything that happened to them lives here, each change
 * with its before and after values.
 *
 * Entry shape:
 *   { day, collection: 'decorations' | 'categories', id, type, name, changes? }
 * where type is 'New Item' | 'Item Updated' | 'Item Removed' | 'Item Returned' and each
 * change is { field, before, after } (plus an optional `detail` on entries migrated from the
 * old per-item history).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const COLLECTION_ORDER = ['categories', 'decorations'];

export function changeLogFile(changesDir, month) {
  return join(changesDir, `${month}.json`);
}

export function changeKey(entry) {
  return [entry.day, entry.collection, entry.id, entry.type, JSON.stringify(entry.changes ?? null)].join('|');
}

export function compareChanges(a, b) {
  return (
    a.day.localeCompare(b.day) ||
    COLLECTION_ORDER.indexOf(a.collection) - COLLECTION_ORDER.indexOf(b.collection) ||
    a.id - b.id
  );
}

export function readChangeLogMonth(changesDir, month) {
  const file = changeLogFile(changesDir, month);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function writeChangeLogMonth(changesDir, month, entries) {
  mkdirSync(changesDir, { recursive: true });
  const sorted = [...entries].sort(compareChanges);
  writeFileSync(changeLogFile(changesDir, month), `${JSON.stringify(sorted, null, 2)}\n`);
}

export function listChangeLogMonths(changesDir) {
  if (!existsSync(changesDir)) {
    return [];
  }
  return readdirSync(changesDir)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 7))
    .sort();
}

function groupByMonth(entries) {
  const byMonth = new Map();
  for (const entry of entries) {
    const month = entry.day.slice(0, 7);
    const bucket = byMonth.get(month) ?? [];
    bucket.push(entry);
    byMonth.set(month, bucket);
  }
  return byMonth;
}

/**
 * Append entries to their month files. An entry identical to one already logged (same day,
 * item, type and changes) is skipped, so re-running a sync on the same day adds nothing.
 * Returns the number of entries actually added.
 */
export function appendChanges(changesDir, entries) {
  let added = 0;
  for (const [month, monthEntries] of groupByMonth(entries)) {
    const existing = readChangeLogMonth(changesDir, month);
    const keys = new Set(existing.map(changeKey));
    const fresh = monthEntries.filter((entry) => {
      const key = changeKey(entry);
      if (keys.has(key)) {
        return false;
      }
      keys.add(key);
      return true;
    });
    if (fresh.length > 0) {
      writeChangeLogMonth(changesDir, month, [...existing, ...fresh]);
      added += fresh.length;
    }
  }
  return added;
}

/** Rewrite the given months whole (used by one-off migrations). Returns the months written. */
export function replaceChangeLogMonths(changesDir, entries) {
  const byMonth = groupByMonth(entries);
  for (const [month, monthEntries] of byMonth) {
    writeChangeLogMonth(changesDir, month, monthEntries);
  }
  return [...byMonth.keys()];
}
