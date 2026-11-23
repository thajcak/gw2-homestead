/**
 * Diffs between a stored item and the item a sync is about to write. Each change records the
 * field with its before and after values, so the change log says exactly what happened.
 */
import { remoteImageSource, remoteOriginalSource } from './content-store.mjs';
import { sanitizeDisplayName, sanitizeText } from './sanitize-text.mjs';

function isEmptyRecipe(recipe) {
  return recipe == null || (typeof recipe === 'object' && Object.keys(recipe).length === 0);
}

/** JSON with sorted object keys, so key order never counts as a change. */
function canonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameValue(a, b) {
  return canonical(a) === canonical(b);
}

function ingredientLines(recipe) {
  return [...(recipe?.ingredients ?? [])]
    .sort((a, b) => a.slot - b.slot)
    .map((ingredient) => `${ingredient.quantity ?? '?'} ${ingredient.item}`);
}

function recipeChanges(before, after) {
  if (isEmptyRecipe(before) && isEmptyRecipe(after)) {
    return [];
  }
  if (isEmptyRecipe(before)) {
    return [{ field: 'recipe', before: null, after }];
  }
  if (isEmptyRecipe(after)) {
    return [{ field: 'recipe', before, after: null }];
  }

  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('ingredients');
  for (const key of [...keys].sort()) {
    if (!sameValue(before[key], after[key])) {
      changes.push({ field: `recipe.${key}`, before: before[key] ?? null, after: after[key] ?? null });
    }
  }

  const beforeIngredients = ingredientLines(before);
  const afterIngredients = ingredientLines(after);
  if (!sameValue(beforeIngredients, afterIngredients)) {
    changes.push({ field: 'recipe.ingredients', before: beforeIngredients, after: afterIngredients });
  }

  return changes;
}

function sortedIds(ids) {
  return [...(ids ?? [])].sort((a, b) => a - b);
}

function textChange(field, before, after, clean) {
  const cleanBefore = clean(before ?? '');
  const cleanAfter = clean(after ?? '');
  return cleanBefore === cleanAfter ? [] : [{ field, before: cleanBefore, after: cleanAfter }];
}

/** Field changes between a stored decoration and the one about to replace it. */
export function diffDecoration(before, after) {
  const changes = [
    ...textChange('name', before.name, after.name, sanitizeDisplayName),
    ...textChange('description', before.description, after.description, sanitizeText),
  ];

  const beforeCategories = sortedIds(before.categories);
  const afterCategories = sortedIds(after.categories);
  if (!sameValue(beforeCategories, afterCategories)) {
    changes.push({ field: 'categories', before: beforeCategories, after: afterCategories });
  }

  // Only compared once both sides know the API's icon URL (items stored before P8 don't).
  if (before.iconSource && after.iconSource && before.iconSource !== after.iconSource) {
    changes.push({ field: 'icon', before: before.iconSource, after: after.iconSource });
  }

  changes.push(...recipeChanges(before.recipe ?? null, after.recipe ?? null));

  // Wiki enrichment only swaps the stored image when the pinned page's own file changes, and
  // only drops it after the page has reported no image for several days (see wiki-api.mjs).
  const beforeImage = remoteOriginalSource(before);
  const afterImage = remoteOriginalSource(after);
  if (beforeImage !== afterImage && !(afterImage == null && after.original)) {
    changes.push({ field: 'image', before: beforeImage, after: afterImage });
  }

  // Gallery views, as their wiki URLs in order; caption edits alone aren't logged.
  const beforeViews = (before.views ?? []).map(remoteImageSource);
  const afterViews = (after.views ?? []).map(remoteImageSource);
  if (!sameValue(beforeViews, afterViews)) {
    changes.push({ field: 'views', before: beforeViews, after: afterViews });
  }

  return changes;
}

export function diffCategory(before, after) {
  return textChange('name', before.name, after.name, sanitizeDisplayName);
}

export function changeEntry({ day, collection, item, type, changes }) {
  return {
    day,
    collection,
    id: item.id,
    type,
    name: sanitizeDisplayName(item.name),
    ...(changes?.length ? { changes } : {}),
  };
}
