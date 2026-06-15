import type { Category, ChangeLogDay, ChangeLogEntry, Decoration } from '../types';

interface HistoryEntry {
  day: string;
  type: ChangeLogEntry['type'];
  name: string;
  changes?: ChangeLogEntry['changes'];
}

function historyToEntry(id: number, history: HistoryEntry): ChangeLogEntry & { day: string } {
  return {
    id,
    day: history.day,
    type: history.type,
    name: history.name,
    ...(history.changes?.length ? { changes: history.changes } : {}),
  };
}

export function buildChangelogDays(
  decorations: Decoration[],
  categories: Category[]
): ChangeLogDay[] {
  const byDay = new Map<string, ChangeLogEntry[]>();

  const addEntries = (id: number, history: HistoryEntry[] | undefined) => {
    for (const item of history ?? []) {
      const dayEntries = byDay.get(item.day) ?? [];
      dayEntries.push(historyToEntry(id, item));
      byDay.set(item.day, dayEntries);
    }
  };

  for (const decoration of decorations) {
    addEntries(decoration.id, decoration.history);
  }

  for (const category of categories) {
    addEntries(category.id, category.history);
  }

  return Array.from(byDay.entries())
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => {
        const typeOrder = (type: string) =>
          [
            'New Item',
            'Item Update',
            'Item Removed',
            'Image Update',
            'Recipe Added',
            'Recipe Updated',
          ].indexOf(type);
        return typeOrder(a.type) - typeOrder(b.type) || a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
