import type { Category, ChangeLogDay, Decoration } from '../types';

export interface SearchIndexEntry {
  id: number;
  name: string;
  description: string;
  categories: number[];
}

export interface CatalogData {
  searchIndex: SearchIndexEntry[];
  decorations: Record<string, Decoration>;
  categories: Category[];
  changelogDays: ChangeLogDay[];
}

const ENTRY_TYPE_ORDER = [
  'New Item',
  'Item Update',
  'Item Removed',
  'Image Update',
  'Recipe Added',
  'Recipe Updated',
] as const;

const ANIMATION_MS = 300;

function resolveAsset(path: string | undefined, base: string): string {
  const placeholder =
    (typeof window !== 'undefined' &&
      (window as Window & { __catalogPlaceholderPreview?: string }).__catalogPlaceholderPreview) ||
    `${base.replace(/\/?$/, '/')}images/placeholder.png`;

  if (!path) {
    return placeholder;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\//, '')}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCategoryMap(categories: Category[]): Map<number, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

function matchesFilters(
  entry: SearchIndexEntry,
  searchQuery: string,
  selectedCategory: string
): boolean {
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const nameMatch = entry.name.toLowerCase().includes(query);
    const descriptionMatch = entry.description?.toLowerCase().includes(query);
    if (!nameMatch && !descriptionMatch) {
      return false;
    }
  }

  if (selectedCategory !== 'all') {
    const categoryId = Number(selectedCategory);
    if (!entry.categories.includes(categoryId)) {
      return false;
    }
  }

  return true;
}

function renderExpandedDecoration(
  decoration: Decoration,
  categoryMap: Map<number, string>,
  itemsPerRow: number,
  decorationIndex: number,
  baseUrl: string
): string {
  const indicatorLeftPosition = `calc(${(decorationIndex % itemsPerRow) * (74 + 16)}px - ${(itemsPerRow * (74 + 16) - 16) / 2}px + 37px)`;
  const imageSource = resolveAsset(decoration.original?.source, baseUrl);
  const hasOriginal = Boolean(decoration.original?.source);

  const categoryTags = decoration.categories
    .map((catId) => {
      const name = categoryMap.get(catId);
      return name
        ? `<span class="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300">${escapeHtml(name)}</span>`
        : '';
    })
    .join('');

  const wikiLink = decoration.wikiTitle
    ? `<a href="https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}" class="text-blue-400 hover:text-blue-300 transition-colors text-sm mt-2 inline-block" target="_blank" rel="noopener noreferrer">View on Wiki →</a>`
    : '';

  let recipeHtml = '<p class="text-xs text-gray-500">No recipe data in catalog for this decoration.</p>';
  if (decoration.recipe) {
    const ratingRow =
      decoration.recipe.rating != null
        ? `<dt class="text-gray-500">Rating</dt><dd>${decoration.recipe.rating}</dd>`
        : '';
    const sheetRow = decoration.recipe.sheet
      ? `<dt class="text-gray-500">Source</dt><dd class="break-words">${escapeHtml(decoration.recipe.sheet)}</dd>`
      : '';
    const ingredients =
      decoration.recipe.ingredients.length > 0
        ? `<ul class="text-xs space-y-0.5 w-full">${decoration.recipe.ingredients
            .map(
              (ing) =>
                `<li class="break-words">${ing.quantity != null ? `${ing.quantity}× ` : ''}${escapeHtml(ing.item)}</li>`
            )
            .join('')}</ul>`
        : '';

    recipeHtml = `<div class="text-sm text-gray-300 w-full space-y-2">
      <div class="text-gray-400 text-xs font-semibold uppercase tracking-wide">Recipe</div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs w-full">${ratingRow}${sheetRow}</dl>
      ${ingredients}
    </div>`;
  }

  return `<div class="expanded-decoration is-collapsed" data-expanded-for="${decoration.id}" style="grid-row: auto;">
    <div class="decoration-indicator" style="margin-left: ${indicatorLeftPosition}"></div>
    <div class="expanded-decoration-gradient">
      <div class="h-full min-h-0 flex flex-col container mx-auto px-6">
        <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-x-0 px-4 md:px-8 lg:px-16">
          <div class="relative min-h-0 min-w-0 flex items-center justify-center py-4" style="min-height: 50vh;">
            <img src="${escapeHtml(imageSource)}" alt="${escapeHtml(decoration.name)}" class="max-h-full max-w-full w-auto object-contain" loading="eager" />
            ${
              hasOriginal
                ? ''
                : '<div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50"><span class="text-white text-lg font-semibold">Image not found</span></div>'
            }
          </div>
          <div class="min-h-0 min-w-0 flex flex-col items-start text-left overflow-y-auto overflow-x-hidden py-4 lg:pl-4 lg:border-l lg:border-gray-700/60">
            <div class="w-full mb-3">
              <h2 class="text-xl font-bold break-words">${escapeHtml(decoration.name)}</h2>
              ${wikiLink}
            </div>
            <div class="flex flex-wrap gap-1.5 justify-start w-full">${categoryTags}</div>
            <div class="w-full border-t border-gray-700/60 pt-3 mt-3">${recipeHtml}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function initCatalog(data: CatalogData, baseUrl: string = '/'): void {
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  const clearSearchButton = document.getElementById('clear-search') as HTMLButtonElement | null;
  const categorySelect = document.getElementById('category-select') as HTMLSelectElement | null;
  const homeResetButton = document.getElementById('home-reset') as HTMLButtonElement | null;
  const openChangelogButton = document.getElementById('open-changelog') as HTMLButtonElement | null;
  const changelogPanel = document.getElementById('changelog-panel');
  const changelogBackdrop = document.getElementById('changelog-backdrop');
  const closeChangelogButton = document.getElementById('close-changelog');
  const changelogScrollTopButton = document.getElementById('changelog-scroll-top');
  const changelogTitleButton = document.getElementById('changelog-title');
  const changelogScrollContainer = document.getElementById('changelog-scroll');
  const filterPrompt = document.getElementById('filter-prompt');
  const filterPromptNo = document.getElementById('filter-prompt-no');
  const filterPromptYes = document.getElementById('filter-prompt-yes');
  const filterPromptName = document.getElementById('filter-prompt-name');
  const grid = document.getElementById('icon-grid');
  const emptyState = document.getElementById('empty-state');
  const categoryCountOptions = document.querySelectorAll<HTMLOptionElement>('[data-category-count]');

  if (!searchInput || !categorySelect || !grid) {
    return;
  }

  const categoryMap = getCategoryMap(data.categories);
  const decorationById = new Map(
    Object.entries(data.decorations).map(([id, decoration]) => [Number(id), decoration])
  );
  const searchIndexById = new Map(data.searchIndex.map((entry) => [entry.id, entry]));

  let searchQuery = '';
  let selectedCategory = 'all';
  let expandedItemId: number | null = null;
  let itemsPerRow = 0;
  let pendingOpenAfterFilterResetId: number | null = null;
  let filterVisibilityPrompt: { id: number; name: string } | null = null;
  const visibleChangelogTypes = new Set<string>(ENTRY_TYPE_ORDER);
  let changelogScrollTop = Number(sessionStorage.getItem('changelogScrollTop') ?? '0');

  const gridItems = Array.from(grid.querySelectorAll<HTMLElement>('.catalog-item'));

  function calculateItemsPerRow(): void {
    const gridWidth = grid!.offsetWidth;
    const itemWidth = 74;
    const gap = 16;
    itemsPerRow = Math.max(1, Math.floor((gridWidth + gap) / (itemWidth + gap)));
  }

  function getVisibleGridItems(): HTMLElement[] {
    return gridItems.filter((item) => !item.classList.contains('is-hidden'));
  }

  function getFilteredIds(): Set<number> {
    const ids = new Set<number>();
    for (const entry of data.searchIndex) {
      if (matchesFilters(entry, searchQuery, selectedCategory)) {
        ids.add(entry.id);
      }
    }
    return ids;
  }

  function getFilteredCount(categoryId?: number): number {
    return data.searchIndex.filter((entry) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = entry.name.toLowerCase().includes(query);
        const descriptionMatch = entry.description?.toLowerCase().includes(query);
        if (!nameMatch && !descriptionMatch) {
          return false;
        }
      }
      if (categoryId !== undefined) {
        return entry.categories.includes(categoryId);
      }
      return true;
    }).length;
  }

  function updateCategoryCounts(): void {
    const allCount = getFilteredCount();
    const allOption = categorySelect!.querySelector('option[value="all"]');
    if (allOption) {
      allOption.textContent = `All Categories (${allCount})`;
    }
    categoryCountOptions.forEach((option) => {
      const categoryId = Number(option.value);
      option.textContent = `${option.dataset.categoryName} (${getFilteredCount(categoryId)})`;
    });
  }

  function applyFilters(): void {
    const filteredIds = getFilteredIds();
    let visibleCount = 0;

    gridItems.forEach((item) => {
      const id = Number(item.dataset.id);
      const visible = filteredIds.has(id);
      item.classList.toggle('is-hidden', !visible);
      if (visible) {
        visibleCount += 1;
      }
    });

    if (emptyState) {
      emptyState.classList.toggle('hidden', visibleCount > 0);
    }

    updateCategoryCounts();

    if (expandedItemId != null && !filteredIds.has(expandedItemId)) {
      collapseExpanded();
    }

    if (pendingOpenAfterFilterResetId != null && filteredIds.has(pendingOpenAfterFilterResetId)) {
      const targetId = pendingOpenAfterFilterResetId;
      pendingOpenAfterFilterResetId = null;
      openDecorationById(targetId);
    }
  }

  function removeExpandedPanel(): void {
    const existing = grid!.querySelector('.expanded-decoration');
    if (existing) {
      existing.remove();
    }
  }

  function scrollToItem(item: HTMLElement): void {
    const headerHeight = 64;
    const offset = 30;
    const itemTop = item.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: itemTop - headerHeight - offset,
      behavior: 'smooth',
    });
  }

  function collapseExpanded(): void {
    const panel = grid!.querySelector<HTMLElement>('.expanded-decoration');
    if (panel) {
      panel.classList.add('is-collapsed');
      panel.style.height = '0px';
      setTimeout(() => {
        removeExpandedPanel();
      }, ANIMATION_MS);
    }
    expandedItemId = null;
    updateDeepLink(null);
  }

  function updateDeepLink(id: number | null): void {
    const url = new URL(window.location.href);
    if (id == null) {
      url.searchParams.delete('open');
    } else {
      url.searchParams.set('open', String(id));
    }
    window.history.replaceState({}, '', url);
  }

  function insertExpandedPanel(decorationId: number, animate: boolean): void {
    const decoration = decorationById.get(decorationId);
    if (!decoration) {
      return;
    }

    const visibleItems = getVisibleGridItems();
    const decorationIndex = visibleItems.findIndex(
      (item) => Number(item.dataset.id) === decorationId
    );
    if (decorationIndex === -1) {
      return;
    }

    const clickedItem = visibleItems[decorationIndex];
    const currentRow = Math.floor(decorationIndex / itemsPerRow);
    const lastInRowIndex = Math.min((currentRow + 1) * itemsPerRow - 1, visibleItems.length - 1);
    const insertAfter = visibleItems[lastInRowIndex];

    removeExpandedPanel();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderExpandedDecoration(
      decoration,
      categoryMap,
      itemsPerRow,
      decorationIndex,
      baseUrl
    );
    const panel = wrapper.firstElementChild as HTMLElement;
    insertAfter.insertAdjacentElement('afterend', panel);

    requestAnimationFrame(() => {
      panel.classList.remove('is-collapsed');
      const targetHeight = Math.max(window.innerHeight * 0.7, 320);
      panel.style.height = animate ? '0px' : `${targetHeight}px`;
      requestAnimationFrame(() => {
        panel.style.height = `${targetHeight}px`;
        setTimeout(() => scrollToItem(clickedItem), animate ? 100 : 0);
      });
    });

    expandedItemId = decorationId;
    updateDeepLink(decorationId);
  }

  function openDecorationById(id: number, options: { animate?: boolean } = {}): void {
    const animate = options.animate ?? true;
    const visibleItems = getVisibleGridItems();
    const newIndex = visibleItems.findIndex((item) => Number(item.dataset.id) === id);
    if (newIndex === -1) {
      return;
    }

    if (expandedItemId === id) {
      collapseExpanded();
      return;
    }

    const currentIndex =
      expandedItemId != null
        ? visibleItems.findIndex((item) => Number(item.dataset.id) === expandedItemId)
        : -1;
    const isSameRow =
      itemsPerRow > 0 &&
      currentIndex >= 0 &&
      Math.floor(newIndex / itemsPerRow) === Math.floor(currentIndex / itemsPerRow);

    if (expandedItemId != null && !isSameRow) {
      const panel = grid!.querySelector<HTMLElement>('.expanded-decoration');
      if (panel) {
        panel.classList.add('is-collapsed');
        panel.style.height = '0px';
        setTimeout(() => insertExpandedPanel(id, true), ANIMATION_MS);
        return;
      }
    }

    insertExpandedPanel(id, expandedItemId != null && isSameRow ? false : animate);
  }

  function clearFilters(): void {
    searchQuery = '';
    selectedCategory = 'all';
    searchInput!.value = '';
    categorySelect!.value = 'all';
    if (clearSearchButton) {
      clearSearchButton.classList.add('hidden');
    }
    applyFilters();
  }

  function handleHomeReset(): void {
    clearFilters();
    collapseExpanded();
    hideFilterPrompt();
    pendingOpenAfterFilterResetId = null;
    closeChangelog();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showFilterPrompt(id: number, name: string): void {
    filterVisibilityPrompt = { id, name };
    if (filterPrompt && filterPromptName) {
      filterPromptName.textContent = name;
      filterPrompt.classList.remove('is-hidden');
    }
  }

  function hideFilterPrompt(): void {
    filterVisibilityPrompt = null;
    filterPrompt?.classList.add('is-hidden');
  }

  function handleChangelogEntryClick(id: number, name: string): void {
    const filteredIds = getFilteredIds();
    closeChangelog();

    if (filteredIds.has(id)) {
      openDecorationById(id);
      return;
    }

    if (decorationById.has(id)) {
      showFilterPrompt(id, name);
    }
  }

  function updateChangelogVisibility(): void {
    document.querySelectorAll<HTMLElement>('.changelog-entry').forEach((entry) => {
      const type = entry.dataset.entryType ?? '';
      entry.classList.toggle('is-hidden', !visibleChangelogTypes.has(type));
    });

    document.querySelectorAll<HTMLElement>('.changelog-day-section').forEach((section) => {
      const visibleEntries = section.querySelectorAll('.changelog-entry:not(.is-hidden)');
      section.classList.toggle('is-hidden', visibleEntries.length === 0);
    });
  }

  function openChangelog(): void {
    changelogPanel?.classList.remove('is-closed');
    if (changelogScrollContainer) {
      changelogScrollContainer.scrollTop = changelogScrollTop;
    }
  }

  function closeChangelog(): void {
    if (changelogScrollContainer) {
      changelogScrollTop = changelogScrollContainer.scrollTop;
      sessionStorage.setItem('changelogScrollTop', String(changelogScrollTop));
    }
    changelogPanel?.classList.add('is-closed');
  }

  function scrollChangelogToTop(): void {
    changelogScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    if (clearSearchButton) {
      clearSearchButton.classList.toggle('hidden', searchQuery.length === 0);
    }
    applyFilters();
  });

  clearSearchButton?.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    clearSearchButton.classList.add('hidden');
    applyFilters();
  });

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    applyFilters();
  });

  homeResetButton?.addEventListener('click', handleHomeReset);
  openChangelogButton?.addEventListener('click', openChangelog);
  changelogBackdrop?.addEventListener('click', closeChangelog);
  closeChangelogButton?.addEventListener('click', closeChangelog);
  changelogScrollTopButton?.addEventListener('click', scrollChangelogToTop);
  changelogTitleButton?.addEventListener('click', scrollChangelogToTop);

  document.querySelectorAll<HTMLButtonElement>('[data-changelog-type-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const entryType = button.dataset.changelogTypeToggle ?? '';
      if (visibleChangelogTypes.has(entryType)) {
        visibleChangelogTypes.delete(entryType);
        button.classList.remove('bg-gray-900', 'text-white', 'border-gray-900');
        button.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
        button.setAttribute('aria-pressed', 'false');
      } else {
        visibleChangelogTypes.add(entryType);
        button.classList.add('bg-gray-900', 'text-white', 'border-gray-900');
        button.classList.remove('bg-white', 'text-gray-600', 'border-gray-300');
        button.setAttribute('aria-pressed', 'true');
      }
      updateChangelogVisibility();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-changelog-entry]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.changelogEntry);
      const name = button.dataset.changelogName ?? '';
      handleChangelogEntryClick(id, name);
    });
  });

  filterPromptNo?.addEventListener('click', hideFilterPrompt);
  filterPromptYes?.addEventListener('click', () => {
    if (!filterVisibilityPrompt) {
      return;
    }
    const targetId = filterVisibilityPrompt.id;
    hideFilterPrompt();
    clearFilters();
    pendingOpenAfterFilterResetId = targetId;
    applyFilters();
  });

  gridItems.forEach((item) => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.id);
      openDecorationById(id);
    });
  });

  window.addEventListener('resize', () => {
    calculateItemsPerRow();
    if (expandedItemId != null) {
      insertExpandedPanel(expandedItemId, false);
    }
  });

  calculateItemsPerRow();
  applyFilters();
  updateChangelogVisibility();

  const openParam = new URLSearchParams(window.location.search).get('open');
  if (openParam) {
    const openId = Number(openParam);
    if (!Number.isNaN(openId) && decorationById.has(openId)) {
      const entry = searchIndexById.get(openId);
      if (entry && !matchesFilters(entry, searchQuery, selectedCategory)) {
        clearFilters();
        pendingOpenAfterFilterResetId = openId;
        applyFilters();
      } else {
        requestAnimationFrame(() => openDecorationById(openId));
      }
    }
  }
}
