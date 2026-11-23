import type { ChangeLogDay } from '../types';
import { formatDay } from './formatDay';
import { spriteStyle } from './sprite';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The Recently Added list, loaded into the dialog when it first opens. Each day shows its
 * date ("Jun 2, 2026"); the page fills in a relative hint ("5 months ago") on load, since a
 * static build can't know when it is read.
 */
export function renderChangelogHtml(days: ChangeLogDay[], sheetUrls: string[]): string {
  if (days.length === 0) {
    return '<p class="changelog-panel__empty">No additions yet.</p>';
  }

  return days
    .map((dayGroup) => {
      const entries = dayGroup.entries
        .map((entry) => {
          const name = escapeHtml(entry.name);
          const icon = entry.sprite
            ? `<span class="changelog-entry__icon sprite-icon" style="${escapeHtml(spriteStyle(entry.sprite, sheetUrls))}" aria-hidden="true"></span>`
            : '<span class="changelog-entry__icon changelog-entry__icon--missing" aria-hidden="true"></span>';
          return `<li><button type="button" class="changelog-entry" data-changelog-entry="${entry.id}" data-changelog-name="${name}">${icon}<span>${name}</span></button></li>`;
        })
        .join('');

      const day = escapeHtml(dayGroup.day);
      const count = dayGroup.entries.length;
      return `<section class="changelog-day-section"><h3 class="changelog-day-section__title"><time datetime="${day}">${escapeHtml(formatDay(dayGroup.day))}</time> <span class="changelog-day-section__meta"><span data-relative-day="${day}"></span>${count} new</span></h3><ul class="changelog-chip-list">${entries}</ul></section>`;
    })
    .join('');
}
