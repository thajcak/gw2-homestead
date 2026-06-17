import type { ChangeLogDay } from '../types';
import { sanitizeDisplayName } from './sanitizeText';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderChangelogHtml(days: ChangeLogDay[]): string {
  if (days.length === 0) {
    return '<p class="changelog-panel__empty">No additions yet.</p>';
  }

  return days
    .map((dayGroup) => {
      const entries = dayGroup.entries
        .map(
          (entry) => {
            const displayName = sanitizeDisplayName(entry.name);
            return `<li><button type="button" class="changelog-entry changelog-entry--chip" data-changelog-entry="${entry.id}" data-changelog-name="${escapeHtml(displayName)}">${escapeHtml(displayName)}</button></li>`;
          }
        )
        .join('');

      return `<section class="changelog-day-section" data-day="${escapeHtml(dayGroup.day)}"><h3 class="changelog-day-section__title">${escapeHtml(dayGroup.day)}</h3><ul class="changelog-chip-list">${entries}</ul></section>`;
    })
    .join('');
}
