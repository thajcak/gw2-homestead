import { readFileSync, writeFileSync } from 'node:fs';

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

function eventToHistoryEntry(event, day) {
  return {
    day,
    type: event.type,
    name: event.name,
    ...(event.changes?.length ? { changes: event.changes } : {}),
  };
}

function dedupeRecipeChangelogEntries(entries) {
  const recipeAddedIds = new Set(
    entries.filter((entry) => entry.type === 'Recipe Added').map((entry) => entry.id)
  );

  return entries.filter(
    (entry) => !(entry.type === 'Recipe Updated' && recipeAddedIds.has(entry.id))
  );
}

function applyEntriesToArray(items, entries, day) {
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const entry of entries) {
    if (!byId.has(entry.id)) {
      continue;
    }

    appendHistory(byId.get(entry.id), eventToHistoryEntry(entry, day));
  }

  return items;
}

const day = process.argv[2];
const entriesFile = process.argv[3];
const decorationsFile = process.argv[4];
const categoriesFile = process.argv[5];

const entries = dedupeRecipeChangelogEntries(JSON.parse(readFileSync(entriesFile, 'utf8')));
let decorations = JSON.parse(readFileSync(decorationsFile, 'utf8'));
let categories = JSON.parse(readFileSync(categoriesFile, 'utf8'));

decorations = applyEntriesToArray(decorations, entries, day);
categories = applyEntriesToArray(categories, entries, day);

writeFileSync(decorationsFile, `${JSON.stringify(decorations, null, 2)}\n`);
writeFileSync(categoriesFile, `${JSON.stringify(categories, null, 2)}\n`);

console.log(`Applied ${entries.length} changelog entries for ${day}.`);
