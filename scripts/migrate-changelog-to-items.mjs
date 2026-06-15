import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { distributeChangelogEvents } from './distribute-changelog-events.mjs';

const rootDir = join(new URL('..', import.meta.url).pathname);
const changelogDir = join(rootDir, 'src/content/changelog');
const decorationsDir = join(rootDir, 'src/content/decorations');
const categoriesDir = join(rootDir, 'src/content/categories');

const events = [];

for (const file of readdirSync(changelogDir).filter((name) => name.endsWith('.json'))) {
  const dayGroup = JSON.parse(readFileSync(join(changelogDir, file), 'utf8'));
  for (const entry of dayGroup.entries ?? []) {
    events.push({
      day: dayGroup.day,
      id: entry.id,
      type: entry.type,
      name: entry.name,
      ...(entry.changes?.length ? { changes: entry.changes } : {}),
    });
  }
}

distributeChangelogEvents(events, decorationsDir, categoriesDir, { resetHistory: true });

for (const file of readdirSync(changelogDir)) {
  rmSync(join(changelogDir, file));
}

console.log(`Migrated ${events.length} changelog events into item content entries.`);
