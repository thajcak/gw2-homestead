import type { ChangeLogDay, ChangeLogEntry, Decoration } from '../types';
import { sanitizeDisplayName } from './sanitizeText';
import type { SpriteRef } from './sprite';

/** Recently Added: current decorations grouped by the day they first appeared, newest first. */
export function buildChangelogDays(
  decorations: Decoration[],
  sprites: Map<number, SpriteRef> = new Map()
): ChangeLogDay[] {
  const byDay = new Map<string, ChangeLogEntry[]>();

  for (const decoration of decorations) {
    if (!decoration.added || decoration.removed) {
      continue;
    }
    const dayEntries = byDay.get(decoration.added) ?? [];
    const sprite = sprites.get(decoration.id);
    dayEntries.push({
      id: decoration.id,
      name: sanitizeDisplayName(decoration.name),
      ...(sprite ? { sprite } : {}),
    });
    byDay.set(decoration.added, dayEntries);
  }

  return Array.from(byDay, ([day, entries]) => ({
    day,
    entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => b.day.localeCompare(a.day));
}
