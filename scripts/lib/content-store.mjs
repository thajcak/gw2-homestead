import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeDisplayName, sanitizeText } from './sanitize-text.mjs';

export function listContentIds(contentDir) {
  if (!existsSync(contentDir)) {
    return [];
  }

  return readdirSync(contentDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => Number.parseInt(name.replace(/\.json$/, ''), 10))
    .filter((id) => Number.isFinite(id));
}

export function loadContentMap(contentDir) {
  const map = new Map();
  for (const id of listContentIds(contentDir)) {
    map.set(id, readContentFile(contentDir, id));
  }
  return map;
}

export function readContentFile(contentDir, id) {
  const filePath = join(contentDir, `${id}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeContentFile(contentDir, item) {
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(join(contentDir, `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`);
}

/** Days a pinned wiki page must keep reporting "no image" before we drop a stored preview. */
export const PREVIEW_MISSING_GRACE_DAYS = 3;

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromDay, toDay) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** True once the wiki has reported no preview for long enough that the stored image should go. */
export function previewRemovalConfirmed(item, today = utcToday()) {
  return (
    typeof item?.previewMissingSince === 'string' &&
    daysBetween(item.previewMissingSince, today) >= PREVIEW_MISSING_GRACE_DAYS
  );
}

export function isRemoteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export function isLocalAssetPath(value) {
  return typeof value === 'string' && !isRemoteUrl(value);
}

export function remoteOriginalSource(item) {
  if (!item?.original) {
    return null;
  }
  if (item.original.remoteSource) {
    return item.original.remoteSource;
  }
  if (isRemoteUrl(item.original.source)) {
    return item.original.source;
  }
  return null;
}

/** Copy wiki/image/recipe fields from an existing content entry onto API payload. */
export function mergeEnrichmentFromExisting(apiItem, existing) {
  if (!existing) {
    return structuredClone(apiItem);
  }

  const merged = structuredClone(apiItem);

  if (existing.wikiTitle && !merged.wikiTitle) {
    merged.wikiTitle = existing.wikiTitle;
  }

  if (existing.recipe != null && merged.recipe == null) {
    merged.recipe = existing.recipe;
  }

  if (existing.original && !merged.original) {
    merged.original = existing.original;
  }

  if (isLocalAssetPath(existing.icon)) {
    // Keep the API's icon URL beside the local file, so a changed icon is noticed (P8).
    if (isRemoteUrl(apiItem.icon)) {
      merged.iconSource = apiItem.icon;
    }
    merged.icon = existing.icon;
  }

  if (existing.previewMissingSince && !Object.hasOwn(merged, 'previewMissingSince')) {
    merged.previewMissingSince = existing.previewMissingSince;
  }

  return merged;
}

/**
 * The day an item first appeared. An item listed by the API again is no longer removed, so
 * `removed` and `missingSince` are not carried over (the sync logs "Item Returned").
 */
function itemDates(existing) {
  return existing?.added ? { added: existing.added } : {};
}

/**
 * The icon fields for the next on-disk decoration. The local file is kept until the API's icon
 * URL changes; then `icon` goes back to the remote URL, which the image localizer downloads.
 * Items stored before `iconSource` existed just record the current URL.
 */
function iconFields(existing, apiItem) {
  const remoteIcon = apiItem.iconSource ?? (isRemoteUrl(apiItem.icon) ? apiItem.icon : existing?.iconSource);
  const iconChanged = Boolean(existing?.iconSource && remoteIcon && existing.iconSource !== remoteIcon);
  const icon = isLocalAssetPath(existing?.icon) && !iconChanged ? existing.icon : (remoteIcon ?? apiItem.icon);
  return remoteIcon ? { icon, iconSource: remoteIcon } : { icon };
}

/** Build the next on-disk decoration from API data, keeping its added day and local assets. */
export function mergeDecorationUpdate(existing, apiItem) {
  const merged = {
    id: apiItem.id,
    name: sanitizeDisplayName(apiItem.name),
    // The API has always sent a description, but a missing one must not break the build (F9).
    description: sanitizeText(apiItem.description ?? ''),
    categories: apiItem.categories,
    ...iconFields(existing, apiItem),
    ...itemDates(existing),
  };

  if (apiItem.wikiTitle ?? existing?.wikiTitle) {
    merged.wikiTitle = apiItem.wikiTitle ?? existing.wikiTitle;
  }

  if (apiItem.recipe != null || existing?.recipe != null) {
    merged.recipe = apiItem.recipe ?? existing?.recipe ?? null;
  }

  if (Object.hasOwn(apiItem, 'original') && apiItem.original === null) {
    // Enrichment confirmed (over several days) that the wiki has no preview image.
  } else if (apiItem.original) {
    merged.original = structuredClone(apiItem.original);
  } else if (existing?.original) {
    merged.original = structuredClone(existing.original);
  }

  // The enriched payload is the source of truth here: merge-existing-enrichment copies the
  // stored value in, and wiki enrichment clears it once the preview is seen again.
  if (apiItem.previewMissingSince) {
    merged.previewMissingSince = apiItem.previewMissingSince;
  }

  return merged;
}

export function mergeCategoryUpdate(existing, apiItem) {
  return {
    id: apiItem.id,
    name: sanitizeDisplayName(apiItem.name),
    ...itemDates(existing),
  };
}
