/**
 * One-off import step for the merge (B1): date decorations by when main's React-era pipeline
 * first saw them, not by the day this branch first synced them.
 *
 * Run it after a normal sync has created the decorations main has and this branch didn't.
 * For each decoration whose earliest "New Item" in main's public/changelog.json is earlier than
 * its `added` day, `added` moves back to that day and its "New Item" change log entry moves
 * with it. Dates only ever move earlier, so the script is safe to re-run.
 *
 * Usage: node scripts/backfill-added-from-main.mjs [path/to/main/changelog.json] [--dry-run]
 *        (default: reads public/changelog.json from origin/main with git)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendChanges, readChangeLogMonth, writeChangeLogMonth } from './lib/change-log.mjs';
import { loadContentMap, writeContentFile } from './lib/content-store.mjs';
import { sanitizeDisplayName } from './lib/sanitize-text.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsDir = join(repoRoot, 'src/content/decorations');
const categoriesDir = join(repoRoot, 'src/content/categories');
const changesDir = join(repoRoot, 'src/data/changes');

function readMainChangelog(path) {
  const text = path
    ? readFileSync(path, 'utf8')
    : execFileSync('git', ['show', 'origin/main:public/changelog.json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
  return JSON.parse(text).days;
}

/**
 * Earliest "New Item" day per decoration ID. The old pipeline also wrote category events under
 * the category's ID, so entries named after a category are skipped.
 */
function firstSeenByMain(days, categoryNames) {
  const first = new Map();
  for (const { day, entries } of days) {
    for (const entry of entries) {
      if (entry.type !== 'New Item' || categoryNames.has(sanitizeDisplayName(entry.name))) {
        continue;
      }
      if (!first.has(entry.id) || day < first.get(entry.id)) {
        first.set(entry.id, day);
      }
    }
  }
  return first;
}

function moveNewItemEntry(decoration, fromDay, toDay) {
  const fromMonth = fromDay.slice(0, 7);
  const monthEntries = readChangeLogMonth(changesDir, fromMonth);
  const isOldEntry = (entry) =>
    entry.collection === 'decorations' && entry.id === decoration.id && entry.type === 'New Item' && entry.day === fromDay;
  const moved = monthEntries.find(isOldEntry);
  if (moved) {
    writeChangeLogMonth(changesDir, fromMonth, monthEntries.filter((entry) => !isOldEntry(entry)));
  }
  appendChanges(changesDir, [
    {
      day: toDay,
      collection: 'decorations',
      id: decoration.id,
      type: 'New Item',
      name: moved?.name ?? sanitizeDisplayName(decoration.name),
    },
  ]);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const path = args.find((arg) => !arg.startsWith('--'));

  const categoryNames = new Set([...loadContentMap(categoriesDir).values()].map((category) => sanitizeDisplayName(category.name)));
  const firstSeen = firstSeenByMain(readMainChangelog(path), categoryNames);
  const decorations = loadContentMap(decorationsDir);

  const moves = [];
  for (const decoration of decorations.values()) {
    const mainDay = firstSeen.get(decoration.id);
    if (mainDay && decoration.added && mainDay < decoration.added) {
      moves.push({ decoration, from: decoration.added, to: mainDay });
    }
  }

  for (const { decoration, from, to } of moves) {
    console.log(`${dryRun ? '[dry run] ' : ''}${decoration.id} ${decoration.name}: added ${from} -> ${to}`);
    if (!dryRun) {
      moveNewItemEntry(decoration, from, to);
      writeContentFile(decorationsDir, { ...decoration, added: to });
    }
  }

  const missing = [...firstSeen.keys()].filter((id) => !decorations.has(id));
  console.log(`${moves.length} decoration(s) re-dated from main's changelog.`);
  if (missing.length > 0) {
    console.log(
      `${missing.length} ID(s) main has logged as new are not in src/content (removed since, or not synced yet): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', ...' : ''}`
    );
  }
}

main();
