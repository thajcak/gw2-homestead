import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function historyKey(entry) {
  return `${entry.day}|${entry.type}|${entry.name}|${JSON.stringify(entry.changes ?? null)}`;
}

function appendHistory(item, entry) {
  item.history = item.history ?? [];
  const key = historyKey(entry);
  if (!item.history.some((existing) => historyKey(existing) === key)) {
    item.history.push(entry);
    item.history.sort((a, b) => b.day.localeCompare(a.day));
  }
}

function eventToHistoryEntry(event) {
  return {
    day: event.day,
    type: event.type,
    name: event.name,
    ...(event.changes?.length ? { changes: event.changes } : {}),
  };
}

function loadJsonMap(dir) {
  const map = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const item = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    map.set(item.id, item);
  }
  return map;
}

function writeMapToDir(map, dir) {
  for (const item of map.values()) {
    writeFileSync(join(dir, String(item.id) + '.json'), `${JSON.stringify(item, null, 2)}\n`);
  }
}

export function distributeChangelogEvents(events, decorationsDir, categoriesDir, options = {}) {
  const { resetHistory = false } = options;
  const decorations = loadJsonMap(decorationsDir);
  const categories = loadJsonMap(categoriesDir);

  if (resetHistory) {
    for (const item of decorations.values()) {
      item.history = [];
    }
    for (const item of categories.values()) {
      item.history = [];
    }
  }

  for (const event of events) {
    const entry = eventToHistoryEntry(event);

    if (decorations.has(event.id)) {
      const decoration = decorations.get(event.id);
      appendHistory(decoration, entry);
      if (event.type === 'Item Removed') {
        decoration.removed = true;
      }
      continue;
    }

    if (categories.has(event.id)) {
      const category = categories.get(event.id);
      appendHistory(category, entry);
      if (event.type === 'Item Removed') {
        category.removed = true;
      }
      continue;
    }

    if (event.type !== 'Item Removed') {
      continue;
    }

    const decorationPath = join(decorationsDir, `${event.id}.json`);
    const categoryPath = join(categoriesDir, `${event.id}.json`);

    if (existsSync(decorationPath)) {
      const decoration = JSON.parse(readFileSync(decorationPath, 'utf8'));
      decoration.removed = true;
      appendHistory(decoration, entry);
      decorations.set(decoration.id, decoration);
    } else if (existsSync(categoryPath)) {
      const category = JSON.parse(readFileSync(categoryPath, 'utf8'));
      category.removed = true;
      appendHistory(category, entry);
      categories.set(category.id, category);
    }
  }

  writeMapToDir(decorations, decorationsDir);
  writeMapToDir(categories, categoriesDir);

  return {
    decorations: decorations.size,
    categories: categories.size,
    events: events.length,
  };
}

function readEventsFile(eventsFile) {
  const content = readFileSync(eventsFile, 'utf8').trim();
  if (!content) {
    return [];
  }

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const eventsFile = process.argv[2];
  const decorationsDir = process.argv[3];
  const categoriesDir = process.argv[4];
  const resetHistory = process.argv.includes('--reset-history');

  const events = readEventsFile(eventsFile);
  const result = distributeChangelogEvents(events, decorationsDir, categoriesDir, { resetHistory });
  console.log(
    `Distributed ${result.events} changelog events across ${result.decorations} decorations and ${result.categories} categories.`
  );
}

if (process.argv[2]) {
  main();
}
