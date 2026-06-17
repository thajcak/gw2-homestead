import type { ChangeLogDay, ChangeLogEntry, Decoration } from '../types';
import { sanitizeDisplayName } from './sanitizeText';

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
    name: sanitizeDisplayName(history.name),
    ...(history.changes?.length ? { changes: history.changes } : {}),
  };
}

/** Changelog entries for when a decoration was first added to the catalog. */
export function buildChangelogDays(decorations: Decoration[]): ChangeLogDay[] {
  const byDay = new Map<string, ChangeLogEntry[]>();

  for (const decoration of decorations) {
    for (const item of decoration.history ?? []) {
      if (item.type !== 'New Item') {
        continue;
      }
      const dayEntries = byDay.get(item.day) ?? [];
      dayEntries.push(historyToEntry(decoration.id, item));
      byDay.set(item.day, dayEntries);
    }
  }

  return Array.from(byDay.entries())
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
