import type { ChangeLogDay } from '../types';

const ENTRY_TYPE_ORDER = [
  'New Item',
  'Item Update',
  'Image Update',
  'Recipe Added',
  'Recipe Updated',
] as const;

const CHIP_ENTRY_TYPES = new Set(['New Item', 'Image Update', 'Recipe Added', 'Recipe Updated']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderChangelogHtml(days: ChangeLogDay[]): string {
  if (days.length === 0) {
    return '<p class="changelog-panel__empty">No recent changes yet.</p>';
  }

  return days
    .map((dayGroup) => {
      const sections = ENTRY_TYPE_ORDER.map((entryType) => {
        const entriesForType = dayGroup.entries.filter((entry) => entry.type === entryType);
        if (entriesForType.length === 0) {
          return '';
        }

        const entriesHtml = CHIP_ENTRY_TYPES.has(entryType)
          ? `<ul class="changelog-chip-list">${entriesForType
              .map(
                (entry) =>
                  `<li><button type="button" class="changelog-entry changelog-entry--chip" data-entry-type="${escapeHtml(entry.type)}" data-changelog-entry="${entry.id}" data-changelog-name="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</button></li>`
              )
              .join('')}</ul>`
          : `<ul class="changelog-entry-list">${entriesForType
              .map((entry) => {
                const changesHtml =
                  entry.type === 'Item Update' && entry.changes && entry.changes.length > 0
                    ? `<ul class="changelog-entry__changes">${entry.changes
                        .slice(0, 3)
                        .map((change) =>
                          `<li>${escapeHtml(
                            change.detail
                              ? change.detail
                              : `${change.field}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`
                          )}</li>`
                        )
                        .join('')}${
                        entry.changes.length > 3
                          ? `<li>+${entry.changes.length - 3} more</li>`
                          : ''
                      }</ul>`
                    : '';

                return `<li><button type="button" class="changelog-entry" data-entry-type="${escapeHtml(entry.type)}" data-changelog-entry="${entry.id}" data-changelog-name="${escapeHtml(entry.name)}"><div>${escapeHtml(entry.name)}</div>${changesHtml}</button></li>`;
              })
              .join('')}</ul>`;

        return `<div class="changelog-type-section"><h4 class="changelog-type-section__title">${entryType}</h4>${entriesHtml}</div>`;
      }).join('');

      return `<section class="changelog-day-section" data-day="${escapeHtml(dayGroup.day)}"><h3 class="changelog-day-section__title">${escapeHtml(dayGroup.day)}</h3>${sections}</section>`;
    })
    .join('');
}
