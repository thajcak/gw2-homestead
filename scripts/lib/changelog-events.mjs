function recipeEmpty(recipe) {
  return recipe == null || (typeof recipe === 'object' && Object.keys(recipe).length === 0);
}

function buildCategoryNameMap(existingCategories, apiCategories) {
  const names = new Map();
  for (const category of existingCategories.values()) {
    names.set(category.id, category.name);
  }
  for (const category of apiCategories) {
    names.set(category.id, category.name);
  }
  return names;
}

function categoryLabel(categoryNames, categoryId) {
  return categoryNames.get(categoryId) ?? `Category ${categoryId}`;
}

function decorationItemUpdateEvent(oldItem, newItem, categoryNames) {
  const oldDescription = String(oldItem.description ?? '');
  const newDescription = String(newItem.description ?? '');
  const changes = [];

  if ((oldItem.name ?? null) !== (newItem.name ?? null)) {
    changes.push({
      field: 'name',
      before: oldItem.name ?? null,
      after: newItem.name ?? null,
    });
  }

  if ((oldItem.max_count ?? null) !== (newItem.max_count ?? null)) {
    changes.push({
      field: 'max_count',
      before: oldItem.max_count ?? null,
      after: newItem.max_count ?? null,
    });
  }

  if (oldDescription.length === 0 && newDescription.length > 0) {
    changes.push({
      field: 'description',
      detail: 'Added Description',
      before: '',
      after: newDescription,
    });
  } else if (oldDescription.length > 0 && newDescription.length === 0) {
    changes.push({
      field: 'description',
      detail: 'Removed Description',
      before: oldDescription,
      after: '',
    });
  } else if (oldDescription !== newDescription) {
    changes.push({
      field: 'description',
      before: oldDescription,
      after: newDescription,
    });
  }

  const oldCategories = oldItem.categories ?? [];
  const newCategories = newItem.categories ?? [];

  for (const categoryId of newCategories.filter((id) => !oldCategories.includes(id))) {
    changes.push({
      field: 'categories',
      detail: `${categoryLabel(categoryNames, categoryId)} was added`,
      before: null,
      after: categoryId,
    });
  }

  for (const categoryId of oldCategories.filter((id) => !newCategories.includes(id))) {
    changes.push({
      field: 'categories',
      detail: `${categoryLabel(categoryNames, categoryId)} was removed`,
      before: categoryId,
      after: null,
    });
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    id: newItem.id,
    type: 'Item Update',
    name: newItem.name,
    changes,
  };
}

function decorationImageUpdateEvent(oldItem, newItem, remoteOriginalSource) {
  const newRemote = remoteOriginalSource(newItem);
  const oldRemote = remoteOriginalSource(oldItem);

  if (newRemote == null || oldRemote === newRemote) {
    return null;
  }

  return {
    id: newItem.id,
    type: 'Image Update',
    name: newItem.name,
  };
}

function decorationRecipeEvent(oldItem, newItem) {
  const oldRecipe = oldItem.recipe ?? null;
  const newRecipe = newItem.recipe ?? null;

  if (!recipeEmpty(oldRecipe) && JSON.stringify(oldRecipe) !== JSON.stringify(newRecipe)) {
    return {
      id: newItem.id,
      type: 'Recipe Updated',
      name: newItem.name,
    };
  }

  if (recipeEmpty(oldRecipe) && !recipeEmpty(newRecipe)) {
    return {
      id: newItem.id,
      type: 'Recipe Added',
      name: newItem.name,
    };
  }

  return null;
}

function categoryItemUpdateEvent(oldItem, newItem) {
  if ((oldItem.name ?? null) === (newItem.name ?? null)) {
    return null;
  }

  return {
    id: newItem.id,
    type: 'Item Update',
    name: newItem.name,
    changes: [
      {
        field: 'name',
        before: oldItem.name ?? null,
        after: newItem.name ?? null,
      },
    ],
  };
}

export function generateDecorationEvents({
  existingDecorations,
  apiDecorations,
  existingCategories,
  apiCategories,
  remoteOriginalSource,
}) {
  const events = [];
  const existingIds = new Set(existingDecorations.keys());
  const apiIds = new Set(apiDecorations.map((item) => item.id));
  const categoryNames = buildCategoryNameMap(existingCategories, apiCategories);

  for (const apiItem of apiDecorations) {
    if (!existingIds.has(apiItem.id)) {
      events.push({
        id: apiItem.id,
        type: 'New Item',
        name: apiItem.name,
      });
      continue;
    }

    const oldItem = existingDecorations.get(apiItem.id);
    const updateEvent = decorationItemUpdateEvent(oldItem, apiItem, categoryNames);
    if (updateEvent) {
      events.push(updateEvent);
    }

    const imageEvent = decorationImageUpdateEvent(oldItem, apiItem, remoteOriginalSource);
    if (imageEvent) {
      events.push(imageEvent);
    }

    const recipeEvent = decorationRecipeEvent(oldItem, apiItem);
    if (recipeEvent) {
      events.push(recipeEvent);
    }
  }

  for (const [id, oldItem] of existingDecorations) {
    if (!apiIds.has(id) && !oldItem.removed) {
      events.push({
        id,
        type: 'Item Removed',
        name: oldItem.name,
      });
    }
  }

  return events;
}

export function generateCategoryEvents({ existingCategories, apiCategories }) {
  const events = [];
  const existingIds = new Set(existingCategories.keys());
  const apiIds = new Set(apiCategories.map((item) => item.id));

  for (const apiItem of apiCategories) {
    if (!existingIds.has(apiItem.id)) {
      events.push({
        id: apiItem.id,
        type: 'New Item',
        name: apiItem.name,
      });
      continue;
    }

    const oldItem = existingCategories.get(apiItem.id);
    const updateEvent = categoryItemUpdateEvent(oldItem, apiItem);
    if (updateEvent) {
      events.push(updateEvent);
    }
  }

  for (const [id, oldItem] of existingCategories) {
    if (!apiIds.has(id) && !oldItem.removed) {
      events.push({
        id,
        type: 'Item Removed',
        name: oldItem.name,
      });
    }
  }

  return events;
}

export function groupEventsById(events) {
  const grouped = new Map();
  for (const event of events) {
    const bucket = grouped.get(event.id) ?? [];
    bucket.push(event);
    grouped.set(event.id, bucket);
  }
  return grouped;
}
