import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const decorationsDir = join(repoRoot, 'src/content/decorations');
const categoriesDir = join(repoRoot, 'src/content/categories');

function migrateFile(filePath) {
  const item = JSON.parse(readFileSync(filePath, 'utf8'));
  let changed = false;

  if ('max_count' in item) {
    delete item.max_count;
    changed = true;
  }

  for (const entry of item.history ?? []) {
    if (entry.type === 'Item Update') {
      entry.type = 'Item Updated';
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
  `Migrated ${decorationUpdates} decoration files and ${categoryUpdates} category files (removed max_count, renamed Item Update).`
);
