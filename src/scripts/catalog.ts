import type { Category, Decoration } from '../types';
import type { OptimizedImage } from '../types/optimizedImage';
import { sanitizeDisplayName, sanitizeText } from '../utils/sanitizeText';

export interface SearchIndexEntry {
  id: number;
  name: string;
  description: string;
  categories: number[];
}

const ANIMATION_MS = 200;
const MAX_ICON_LOADS = 3;
const SCROLL_SETTLE_MS = 150;
const ICON_ROOT_MARGIN = '80px 0px';
const SCROLL_HEADER_OFFSET = 94;

type PanelScrollBehavior = ScrollBehavior | 'instant';

function waitForNextFrame(count = 1): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function isItemNearViewport(item: HTMLElement): boolean {
  const rect = item.getBoundingClientRect();
  const margin = window.innerHeight * 0.75;
  return rect.top < window.innerHeight + margin && rect.bottom > -margin;
}

function resolveScrollBehavior(
  item: HTMLElement,
  preferred?: PanelScrollBehavior
): PanelScrollBehavior {
  if (preferred) {
    return preferred;
  }
  return isItemNearViewport(item) ? 'smooth' : 'auto';
}

function catalogUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\//, '')}`;
}

function resolvePublishedUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const basePath = baseUrl.replace(/\/$/, '');
  if (url.startsWith('/')) {
    if (basePath && (url === basePath || url.startsWith(`${basePath}/`))) {
      return url;
    }
    return basePath ? `${basePath}${url}` : url;
  }

  return catalogUrl(baseUrl, url);
}

function resolveAsset(path: string | undefined, base: string): string {
  const placeholder =
    (typeof window !== 'undefined' &&
      (window as Window & { __catalogPlaceholderPreview?: string }).__catalogPlaceholderPreview) ||
    catalogUrl(base, 'images/placeholder.png');

  if (!path) {
    return placeholder;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return catalogUrl(base, path);
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

function renderPreviewImage(
  preview: OptimizedImage | undefined,
  alt: string,
  deferLoad: boolean
): string {
  if (!preview?.src) {
    return `<div class="expanded-preview is-missing" role="status">Image not found</div>`;
  }

  const attrs = [
    'class="expanded-preview__img"',
    `alt="${escapeHtml(alt)}"`,
    `width="${preview.width}"`,
    `height="${preview.height}"`,
    'decoding="async"',
    'onload="this.closest(\'.expanded-preview\')?.classList.add(\'is-loaded\')"',
  ];

  if (deferLoad) {
    attrs.push(`data-preview-src="${escapeHtml(preview.src)}"`);
    if (preview.srcSet) {
      attrs.push(`data-preview-srcset="${escapeHtml(preview.srcSet)}"`);
    }
    if (preview.sizes) {
      attrs.push(`data-preview-sizes="${escapeHtml(preview.sizes)}"`);
    }
  } else {
    attrs.push(`src="${escapeHtml(preview.src)}"`);
    if (preview.srcSet) {
      attrs.push(`srcset="${escapeHtml(preview.srcSet)}"`);
    }
    if (preview.sizes) {
      attrs.push(`sizes="${escapeHtml(preview.sizes)}"`);
    }
    attrs.push('loading="eager"', 'fetchpriority="high"');
  }

  return `<div class="expanded-preview">
        <div class="expanded-preview__skeleton" aria-hidden="true"></div>
        <img ${attrs.join(' ')} />
      </div>`;
}

function renderExpandedDecoration(
  decoration: Decoration,
  categoryMap: Map<number, string>,
  itemsPerRow: number,
  decorationIndex: number,
  previewUrls: Record<string, OptimizedImage>,
  deferPreviewLoad = false
): string {
  const displayName = sanitizeDisplayName(decoration.name);
  const indicatorLeft = `calc(50% + ${(decorationIndex % itemsPerRow) * (74 + 16)}px - ${(itemsPerRow * (74 + 16) - 16) / 2}px + 37px)`;
  const preview = previewUrls[String(decoration.id)];
  const imageFrameContent = renderPreviewImage(preview, displayName, deferPreviewLoad);

  const categoryTags = decoration.categories
    .map((catId) => {
      const name = categoryMap.get(catId);
      return name ? `<span class="expanded-tag">${escapeHtml(name)}</span>` : '';
    })
    .join('');

  const wikiLink = decoration.wikiTitle
    ? `<a href="https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}" class="expanded-wiki-link" target="_blank" rel="noopener noreferrer">View on Wiki →</a>`
    : '';

  let recipeHtml =
    '<p class="expanded-recipe-empty">No recipe data in catalog for this decoration.</p>';
  if (decoration.recipe) {
    const ratingRow =
      decoration.recipe.rating != null
        ? `<dt>Rating</dt><dd>${decoration.recipe.rating}</dd>`
        : '';
    const sheetRow = decoration.recipe.sheet
      ? `<dt>Source</dt><dd class="expanded-recipe-break">${escapeHtml(decoration.recipe.sheet)}</dd>`
      : '';
    const ingredients =
      decoration.recipe.ingredients.length > 0
        ? `<ul class="expanded-recipe-list">${decoration.recipe.ingredients
            .map(
              (ing) =>
                `<li class="expanded-recipe-break">${ing.quantity != null ? `${ing.quantity}× ` : ''}${escapeHtml(ing.item)}</li>`
            )
            .join('')}</ul>`
        : '';

    recipeHtml = `<div class="expanded-recipe">
      <div class="expanded-recipe__title">Recipe</div>
      <dl class="expanded-recipe__meta">${ratingRow}${sheetRow}</dl>
      ${ingredients}
    </div>`;
  }

  return `<div class="expanded-decoration is-collapsed" data-expanded-for="${decoration.id}" style="grid-row: auto;">
    <div class="expanded-decoration-gradient">
      <div class="decoration-indicator" style="left: ${indicatorLeft}"></div>
      <div class="expanded-decoration__body">
        <div class="expanded-decoration__layout">
          <div class="expanded-decoration__media">
            ${imageFrameContent}
          </div>
          <div class="expanded-decoration__details">
            <div class="expanded-heading">
              <h2 class="expanded-title">${escapeHtml(displayName)}</h2>
              ${wikiLink}
            </div>
            <div class="expanded-tags">${categoryTags}</div>
            <div class="expanded-recipe-section">${recipeHtml}</div>
          </div>
        </div>
      </div>
    </div>
    </div>`;
}

export async function initCatalog(baseUrl: string = '/'): Promise<void> {
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

  const basePath = baseUrl.replace(/\/$/, '');
  const catalogIndexPath = basePath ? `${basePath}/` : '/';
  const catalogBase = catalogUrl(baseUrl, 'catalog');

  const [searchIndex, categories, iconManifest, previewUrls] = await Promise.all([
    fetch(catalogUrl(baseUrl, 'catalog/search-index.json')).then(
      (response) => response.json() as Promise<SearchIndexEntry[]>
    ),
    fetch(catalogUrl(baseUrl, 'catalog/categories.json')).then(
      (response) => response.json() as Promise<Category[]>
    ),
    fetch(catalogUrl(baseUrl, 'catalog/icon-manifest.json')).then(
      (response) => response.json() as Promise<Record<string, string>>
    ),
    fetch(catalogUrl(baseUrl, 'catalog/preview-manifest.json')).then(
      (response) => response.json() as Promise<Record<string, OptimizedImage>>
    ),
  ]);

  const categoryMap = getCategoryMap(categories);
  const searchIndexById = new Map(searchIndex.map((entry) => [entry.id, entry]));
  const decorationCache = new Map<number, Decoration>();
  const knownDecorationIds = new Set<number>();

  let searchQuery = '';
  let selectedCategory = 'all';
  let expandedItemId: number | null = null;
  let itemsPerRow = 0;
  let pendingOpenAfterFilterResetId: number | null = null;
  let filterVisibilityPrompt: { id: number; name: string } | null = null;
  let changelogScrollTop = Number(sessionStorage.getItem('changelogScrollTop') ?? '0');
  let gridItems: HTMLElement[] = [];
  let changelogLoaded = false;
  let changelogLoading: Promise<void> | null = null;
  let activeExpandToken = 0;
  let panelRemovalToken = 0;
  let suppressIconLoads = false;

  async function loadDecoration(id: number): Promise<Decoration | undefined> {
    if (decorationCache.has(id)) {
      return decorationCache.get(id);
    }

    const response = await fetch(`${catalogBase}/decorations/${id}.json`);
    if (!response.ok) {
      return undefined;
    }

    const decoration = (await response.json()) as Decoration;
    decorationCache.set(id, decoration);
    knownDecorationIds.add(id);
    return decoration;
  }

  async function decorationExists(id: number): Promise<boolean> {
    if (knownDecorationIds.has(id) || searchIndexById.has(id)) {
      return true;
    }

    const decoration = await loadDecoration(id);
    return decoration != null;
  }

  function normalizeCatalogPathname(pathname: string): string {
    if (basePath && pathname === basePath) {
      return catalogIndexPath;
    }
    return pathname;
  }

  function syncCatalogUrl(url: URL): void {
    url.pathname = normalizeCatalogPathname(url.pathname);
    window.history.replaceState({}, '', url);
  }

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
    for (const entry of searchIndex) {
      if (matchesFilters(entry, searchQuery, selectedCategory)) {
        ids.add(entry.id);
      }
    }
    return ids;
  }

  function getFilteredCount(categoryId?: number): number {
    return searchIndex.filter((entry) => {
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
      const wasHidden = item.classList.contains('is-hidden');
      item.classList.toggle('is-hidden', !visible);
      if (visible) {
        visibleCount += 1;
        if (wasHidden) {
          queueIconLoad(item);
        }
      }
    });

    if (emptyState) {
      emptyState.classList.toggle('is-hidden', visibleCount > 0);
    }

    updateCategoryCounts();

    if (expandedItemId != null && !filteredIds.has(expandedItemId)) {
      collapseExpanded();
    }

    if (pendingOpenAfterFilterResetId != null && filteredIds.has(pendingOpenAfterFilterResetId)) {
      const targetId = pendingOpenAfterFilterResetId;
      pendingOpenAfterFilterResetId = null;
      void openDecorationFromDeepLink(targetId);
    }
  }

  function removeExpandedPanel(): void {
    const existing = grid!.querySelector('.expanded-decoration');
    if (existing) {
      existing.remove();
    }
  }

  function scrollToItem(item: HTMLElement, behavior: PanelScrollBehavior = 'smooth'): void {
    const itemTop = item.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: itemTop - SCROLL_HEADER_OFFSET,
      behavior: behavior === 'instant' ? 'auto' : behavior,
    });
  }

  function loadDeferredPreview(panel: HTMLElement, delayMs = 0): void {
    const startLoad = () => {
      const img = panel.querySelector<HTMLImageElement>('img[data-preview-src]');
      if (!img?.dataset.previewSrc) {
        return;
      }

      img.loading = 'eager';
      img.fetchPriority = 'high';
      img.src = img.dataset.previewSrc;

      if (img.dataset.previewSrcset) {
        img.srcset = img.dataset.previewSrcset;
        img.removeAttribute('data-preview-srcset');
      }

      if (img.dataset.previewSizes) {
        img.sizes = img.dataset.previewSizes;
        img.removeAttribute('data-preview-sizes');
      }

      img.removeAttribute('data-preview-src');
    };

    if (delayMs > 0) {
      setTimeout(startLoad, delayMs);
      return;
    }
    startLoad();
  }

  function collapseExpanded(): void {
    activeExpandToken += 1;

    const removalToken = ++panelRemovalToken;
    const panel = grid!.querySelector<HTMLElement>('.expanded-decoration');
    if (panel) {
      panel.classList.add('is-collapsed');
      setTimeout(() => {
        if (removalToken !== panelRemovalToken) {
          return;
        }
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
    syncCatalogUrl(url);
  }

  async function insertExpandedPanel(
    decorationId: number,
    animate: boolean,
    token: number,
    options: {
      scroll?: PanelScrollBehavior;
      deferPreview?: boolean;
      decorationPromise?: Promise<Decoration | undefined>;
      preScroll?: boolean;
    } = {}
  ): Promise<void> {
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
    const scrollBehavior = resolveScrollBehavior(clickedItem, options.scroll);

    if (options.preScroll) {
      scrollToItem(clickedItem, scrollBehavior);
    }

    const decoration = await (options.decorationPromise ?? loadDecoration(decorationId));
    if (token !== activeExpandToken || !decoration) {
      return;
    }

    panelRemovalToken += 1;
    removeExpandedPanel();

    if (token !== activeExpandToken) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderExpandedDecoration(
      decoration,
      categoryMap,
      itemsPerRow,
      decorationIndex,
      previewUrls,
      options.deferPreview ?? false
    );
    const panel = wrapper.firstElementChild as HTMLElement;
    if (!panel) {
      return;
    }

    insertAfter.insertAdjacentElement('afterend', panel);

    const targetHeight = Math.max(window.innerHeight * 0.7, 320);
    panel.style.height = `${targetHeight}px`;

    if (animate) {
      panel.classList.add('is-collapsed');
      requestAnimationFrame(() => {
        if (token !== activeExpandToken) {
          panel.remove();
          return;
        }
        panel.classList.remove('is-collapsed');
        if (!options.preScroll) {
          setTimeout(() => scrollToItem(clickedItem, scrollBehavior), 50);
        }
      });
    } else {
      panel.classList.remove('is-collapsed');
      if (!options.preScroll) {
        scrollToItem(clickedItem, scrollBehavior);
      }
    }

    if (options.deferPreview) {
      loadDeferredPreview(panel, SCROLL_SETTLE_MS);
    }

    expandedItemId = decorationId;
    updateDeepLink(decorationId);
  }

  async function openDecorationById(
    id: number,
    options: { animate?: boolean; scroll?: PanelScrollBehavior; deferPreview?: boolean } = {}
  ): Promise<void> {
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

    const token = ++activeExpandToken;
    const decorationPromise = loadDecoration(id);
    const isPanelSwap = expandedItemId != null;

    suppressIconLoads = true;
    isScrolling = true;

    try {
      const currentIndex =
        expandedItemId != null
          ? visibleItems.findIndex((item) => Number(item.dataset.id) === expandedItemId)
          : -1;
      const isSameRow =
        itemsPerRow > 0 &&
        currentIndex >= 0 &&
        Math.floor(newIndex / itemsPerRow) === Math.floor(currentIndex / itemsPerRow);

      await insertExpandedPanel(
        id,
        isPanelSwap ? false : animate,
        token,
        {
          scroll: isPanelSwap ? 'auto' : options.scroll,
          deferPreview: options.deferPreview,
          decorationPromise,
          preScroll: isPanelSwap && !isSameRow,
        }
      );
    } finally {
      suppressIconLoads = false;
      scheduleIconLoadsAfterScroll();
    }
  }

  async function openDecorationFromDeepLink(id: number): Promise<void> {
    suppressIconLoads = true;
    isScrolling = true;

    try {
      const visibleItems = getVisibleGridItems();
      const item = visibleItems.find((el) => Number(el.dataset.id) === id);
      if (item && !isItemNearViewport(item)) {
        scrollToItem(item, 'auto');
        await waitForNextFrame(2);
      }

      await openDecorationById(id, {
        animate: false,
        scroll: 'auto',
        deferPreview: true,
      });
    } finally {
      suppressIconLoads = false;
      scheduleIconLoadsAfterScroll();
    }
  }

  function clearFilters(): void {
    searchQuery = '';
    selectedCategory = 'all';
    searchInput!.value = '';
    categorySelect!.value = 'all';
    if (clearSearchButton) {
      clearSearchButton.classList.add('is-hidden');
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

  async function handleChangelogEntryClick(id: number, name: string): Promise<void> {
    const filteredIds = getFilteredIds();
    closeChangelog();

    if (filteredIds.has(id)) {
      await openDecorationById(id);
      return;
    }

    if (await decorationExists(id)) {
      showFilterPrompt(id, name);
    }
  }

  function openChangelog(): void {
    changelogPanel?.classList.remove('is-closed');
    void ensureChangelogLoaded();
    if (changelogScrollContainer) {
      changelogScrollContainer.scrollTop = changelogScrollTop;
    }
  }

  async function ensureChangelogLoaded(): Promise<void> {
    if (changelogLoaded) {
      return;
    }
    if (changelogLoading) {
      await changelogLoading;
      return;
    }

    changelogLoading = (async () => {
      const response = await fetch(catalogUrl(baseUrl, 'catalog/changelog.html'));
      if (!response.ok || !changelogScrollContainer) {
        return;
      }

      changelogScrollContainer.innerHTML = await response.text();
      changelogLoaded = true;
    })();

    await changelogLoading;
    changelogLoading = null;
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

  function buildGrid(): void {
    grid!.replaceChildren();

    gridItems = searchIndex.map((entry) => {
      const displayName = sanitizeDisplayName(entry.name);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'catalog-item';
      item.dataset.id = String(entry.id);
      item.dataset.categories = entry.categories.join(',');
      item.dataset.searchText = `${displayName} ${sanitizeText(entry.description ?? '')}`.toLowerCase();
      item.setAttribute('aria-label', displayName);
      item.innerHTML = '<div class="catalog-icon" aria-hidden="true"></div>';
      item.addEventListener('click', () => {
        void openDecorationById(entry.id);
      });
      grid!.appendChild(item);
      return item;
    });
  }

  let activeIconLoads = 0;
  const iconLoadQueue = new Set<HTMLElement>();
  const iconsInView = new Set<HTMLElement>();
  let isScrolling = false;
  let scrollSettleTimer: ReturnType<typeof setTimeout> | null = null;

  function canLoadIcon(item: HTMLElement): boolean {
    const iconRoot = item.querySelector('.catalog-icon');
    return Boolean(
      iconRoot && !iconRoot.querySelector('img') && !iconRoot.classList.contains('catalog-icon--missing')
    );
  }

  function iconUrl(id: number): string {
    const optimized = iconManifest[String(id)];
    if (!optimized) {
      return resolveAsset(undefined, baseUrl);
    }
    return resolvePublishedUrl(optimized, baseUrl);
  }

  function loadIconForItem(item: HTMLElement): void {
    const iconRoot = item.querySelector('.catalog-icon');
    if (!iconRoot || iconRoot.querySelector('img') || iconRoot.classList.contains('catalog-icon--missing')) {
      activeIconLoads = Math.max(0, activeIconLoads - 1);
      pumpIconQueue();
      return;
    }

    const id = Number(item.dataset.id);
    const entry = searchIndexById.get(id);
    const img = document.createElement('img');
    img.className = 'catalog-icon__img';
    img.alt = sanitizeDisplayName(entry?.name ?? '');
    img.decoding = 'async';
    img.loading = 'lazy';
    img.fetchPriority = 'low';
    img.onload = () => {
      iconRoot.classList.add('is-loaded');
      activeIconLoads = Math.max(0, activeIconLoads - 1);
      pumpIconQueue();
    };
    img.onerror = () => {
      iconRoot.classList.add('catalog-icon--missing');
      iconRoot.textContent = '?';
      activeIconLoads = Math.max(0, activeIconLoads - 1);
      pumpIconQueue();
    };
    img.src = iconUrl(id);
    iconRoot.appendChild(img);
  }

  function pumpIconQueue(): void {
    if (isScrolling || suppressIconLoads) {
      return;
    }

    let deferred = 0;
    const maxDeferred = iconLoadQueue.size;

    while (activeIconLoads < MAX_ICON_LOADS && iconLoadQueue.size > 0) {
      const item = iconLoadQueue.values().next().value as HTMLElement | undefined;
      if (!item) {
        break;
      }
      iconLoadQueue.delete(item);

      if (item.classList.contains('is-hidden') || !iconsInView.has(item)) {
        deferred += 1;
        if (deferred >= maxDeferred) {
          break;
        }
        continue;
      }

      if (!canLoadIcon(item)) {
        deferred = 0;
        continue;
      }

      deferred = 0;
      activeIconLoads += 1;
      loadIconForItem(item);
    }
  }

  function syncIconLoadQueue(): void {
    iconLoadQueue.clear();
    for (const item of iconsInView) {
      if (!item.classList.contains('is-hidden') && canLoadIcon(item)) {
        iconLoadQueue.add(item);
      }
    }
    pumpIconQueue();
  }

  function scheduleIconLoadsAfterScroll(): void {
    if (scrollSettleTimer != null) {
      clearTimeout(scrollSettleTimer);
    }
    isScrolling = true;
    scrollSettleTimer = setTimeout(() => {
      scrollSettleTimer = null;
      isScrolling = false;
      syncIconLoadQueue();
    }, SCROLL_SETTLE_MS);
  }

  function queueIconLoad(item: HTMLElement): void {
    if (!canLoadIcon(item)) {
      return;
    }
    if (!isScrolling && !suppressIconLoads) {
      iconLoadQueue.add(item);
      pumpIconQueue();
    }
  }

  const iconObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          iconsInView.add(item);
        } else {
          iconsInView.delete(item);
          iconLoadQueue.delete(item);
        }
      }

      if (!isScrolling && !suppressIconLoads) {
        syncIconLoadQueue();
      }
    },
    { rootMargin: ICON_ROOT_MARGIN }
  );

  function observeGridIcons(): void {
    gridItems.forEach((item) => iconObserver.observe(item));
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    if (clearSearchButton) {
      clearSearchButton.classList.toggle('is-hidden', searchQuery.length === 0);
    }
    applyFilters();
  });

  clearSearchButton?.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    clearSearchButton.classList.add('is-hidden');
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

  changelogScrollContainer?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-changelog-entry]');
    if (!target) {
      return;
    }

    const id = Number(target.dataset.changelogEntry);
    const name = target.dataset.changelogName ?? '';
    void handleChangelogEntryClick(id, name);
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

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    'scroll',
    () => {
      scheduleIconLoadsAfterScroll();
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    calculateItemsPerRow();
    if (expandedItemId == null) {
      return;
    }
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (expandedItemId == null) {
        return;
      }
      const id = expandedItemId;
      const token = activeExpandToken;
      void insertExpandedPanel(id, false, token);
    }, 150);
  });

  buildGrid();
  calculateItemsPerRow();
  applyFilters();
  observeGridIcons();

  const openParam = new URLSearchParams(window.location.search).get('open');
  const pendingDeepLinkId =
    openParam && !Number.isNaN(Number(openParam)) ? Number(openParam) : null;

  if (pendingDeepLinkId != null) {
    suppressIconLoads = true;
    isScrolling = true;
  } else {
    syncIconLoadQueue();
  }

  syncCatalogUrl(new URL(window.location.href));

  if (pendingDeepLinkId != null) {
    const entry = searchIndexById.get(pendingDeepLinkId);
    if (entry && !matchesFilters(entry, searchQuery, selectedCategory)) {
      clearFilters();
      pendingOpenAfterFilterResetId = pendingDeepLinkId;
      applyFilters();
    } else if (entry) {
      requestAnimationFrame(() => {
        void openDecorationFromDeepLink(pendingDeepLinkId);
      });
    } else if (await decorationExists(pendingDeepLinkId)) {
      clearFilters();
      pendingOpenAfterFilterResetId = pendingDeepLinkId;
      applyFilters();
    } else {
      suppressIconLoads = false;
      isScrolling = false;
      syncIconLoadQueue();
    }
  }
}
