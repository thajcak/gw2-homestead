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

/** The earliest "New Item" entry, i.e. when the decoration actually first appeared. */
function firstAddedEntry(history: HistoryEntry[] = []): HistoryEntry | null {
  let first: HistoryEntry | null = null;
  for (const item of history) {
    if (item.type === 'New Item' && (!first || item.day < first.day)) {
      first = item;
    }
  }
  return first;
}

/**
 * Changelog entries for when each decoration was first added to the catalog.
 * A decoration appears once, on its earliest "New Item" day, even if older pipeline runs
 * logged it as new more than once.
 */
export function buildChangelogDays(decorations: Decoration[]): ChangeLogDay[] {
  const byDay = new Map<string, ChangeLogEntry[]>();

  for (const decoration of decorations) {
    const added = firstAddedEntry(decoration.history);
    if (!added) {
      continue;
    }
    const dayEntries = byDay.get(added.day) ?? [];
    dayEntries.push(historyToEntry(decoration.id, added));
    byDay.set(added.day, dayEntries);
  }

  return Array.from(byDay.entries())
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
