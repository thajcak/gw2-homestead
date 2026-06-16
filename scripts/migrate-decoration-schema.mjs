import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsDir = join(repoRoot, 'src/content/decorations');
const categoriesDir = join(repoRoot, 'src/content/categories');

const HISTORY_TYPE_RENAMES = {
  'Item Update': 'Item Updated',
  'Image Update': 'Image Updated',
  'Recipe Added': 'Recipe Updated',
};

function migrateHistoryEntry(entry) {
  const nextType = HISTORY_TYPE_RENAMES[entry.type];
  if (!nextType) {
    return false;
  }
  entry.type = nextType;
  return true;
}

function migrateFile(filePath) {
  const item = JSON.parse(readFileSync(filePath, 'utf8'));
  let changed = false;

  if ('max_count' in item) {
    delete item.max_count;
    changed = true;
  }

  for (const entry of item.history ?? []) {
    if (migrateHistoryEntry(entry)) {
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, `${JSON.stringify(item, null, 2)}\n`);
  }

  return changed;
}

function migrateDirectory(dir) {
  let updated = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    if (migrateFile(join(dir, file))) {
      updated += 1;
    }
  }
  return updated;
}

const decorationUpdates = migrateDirectory(decorationsDir);
const categoryUpdates = migrateDirectory(categoriesDir);

console.log(
  `Migrated ${decorationUpdates} decoration files and ${categoryUpdates} category files.`
);
