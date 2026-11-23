import type { PublishedDecoration as Decoration, SearchIndexEntry } from '../build/catalogData';
import type { OptimizedImage } from '../types/optimizedImage';
import { formatDay } from '../utils/formatDay';
import { spriteStyle } from '../utils/sprite';

/** The details panel expands and collapses (height) over this long. */
const PANEL_ANIMATION_MS = 280;
const PANEL_ANIMATION_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** Start fetching a row's icon sheet a little before the row scrolls into view. */
const ICON_ROOT_MARGIN = '200px 0px';
const TOOLTIP_DELAY_MS = 300;
/** After a tooltip hides, the next one within this window shows at once (moving along a row). */
const TOOLTIP_WARM_MS = 400;
const RESULTS_STATUS_DELAY_MS = 500;
/** Delay before a deep-linked panel's preview starts loading, so the page settles first. */
const DEFERRED_PREVIEW_DELAY_MS = 150;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_VIEWPORT_SHARE = 0.7;
/** Height of the media area when a decoration has no preview (enlarged icon and a note). */
const MISSING_PREVIEW_HEIGHT = 280;
/** Matches the media column's padding-block in global.css. */
const PANEL_MEDIA_PADDING = 32;
/** Grid item size and gap, as in global.css. */
const ITEM_SIZE = 74;
const ITEM_GAP = 16;

const EXPANDED_PANEL_ID = 'decoration-panel';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate the panel's height (and bottom margin) between two sizes. The content inside is
 * pinned at its open height, so it is revealed or covered rather than re-laid out every frame
 * (an image loading mid-animation then only paints in place). The clip leaves room above the
 * panel for the notch that points at the selected icon. Both are cleared when the animation
 * ends or is cancelled.
 */
function animatePanelSize(
  panel: HTMLElement,
  from: { height: number; marginBottom: string },
  to: { height: number; marginBottom: string }
): Animation {
  const content = panel.querySelector<HTMLElement>('.expanded-decoration-gradient');
  if (content) {
    content.style.height = `${Math.max(from.height, to.height)}px`;
    content.style.maxHeight = 'none';
  }
  panel.style.clipPath = 'inset(-4rem 0 0 0)';
  const animation = panel.animate(
    [
      // min-height is lifted so its min-content floor doesn't hold the panel open.
      { height: `${from.height}px`, minHeight: '0px', marginBottom: from.marginBottom },
      { height: `${to.height}px`, minHeight: '0px', marginBottom: to.marginBottom },
    ],
    { duration: PANEL_ANIMATION_MS, easing: PANEL_ANIMATION_EASING }
  );
  const reset = () => {
    panel.style.removeProperty('clip-path');
    content?.style.removeProperty('height');
    content?.style.removeProperty('max-height');
  };
  animation.addEventListener('finish', reset);
  animation.addEventListener('cancel', reset);
  return animation;
}

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

function resolveScrollBehavior(item: HTMLElement, preferred?: ScrollBehavior): ScrollBehavior {
  if (preferred) {
    return preferred;
  }
  return isItemNearViewport(item) ? 'smooth' : 'auto';
}

function catalogUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\//, '')}`;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wikiArticleUrl(title: string): string {
  return `https://wiki.guildwars2.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[‘’]/g, "'");
}

/** Split a query into words; an entry matches when every word appears somewhere in its text. */
function tokenizeQuery(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/** Name, category names and description (boilerplate already removed at build time). */
function buildSearchHaystack(entry: SearchIndexEntry, categoryMap: Map<number, string>): string {
  const categoryNames = entry.categories.map((id) => categoryMap.get(id) ?? '');
  return normalizeSearchText([entry.name, ...categoryNames, entry.description ?? ''].join(' '));
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "today", "3 days ago", "5 months ago" for a YYYY-MM-DD day. */
function relativeDay(day: string, now = new Date()): string {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - todayUtc) / 86_400_000);
  const ago = Math.abs(days);
  if (ago < 7) {
    return RELATIVE_TIME.format(days, 'day');
  }
  if (ago < 30) {
    return RELATIVE_TIME.format(Math.round(days / 7), 'week');
  }
  if (ago < 365) {
    return RELATIVE_TIME.format(Math.round(days / 30.44), 'month');
  }
  return RELATIVE_TIME.format(Math.round(days / 365.25), 'year');
}

function renderPreview(
  decoration: Decoration,
  alt: string,
  deferLoad: boolean,
  iconHtml: string
): string {
  const preview: OptimizedImage | undefined = decoration.preview;
  if (!preview?.src) {
    return `<div class="expanded-preview is-missing">
        ${iconHtml}
        <p class="expanded-preview__note">No preview on the wiki yet</p>
      </div>`;
  }

  const attrs = [
    'class="expanded-preview__img"',
    `alt="${escapeHtml(alt)}"`,
    `width="${preview.width}"`,
    `height="${preview.height}"`,
    `style="--preview-w: ${preview.width}; --preview-h: ${preview.height}"`,
    'decoding="async"',
    'onload="this.closest(\'.expanded-preview\')?.classList.add(\'is-loaded\')"',
  ];

  const prefix = deferLoad ? 'data-preview-' : '';
  attrs.push(`${prefix}src="${escapeHtml(preview.src)}"`);
  if (preview.srcSet) {
    attrs.push(`${prefix}srcset="${escapeHtml(preview.srcSet)}"`);
  }
  if (preview.sizes) {
    attrs.push(`${prefix}sizes="${escapeHtml(preview.sizes)}"`);
  }
  if (!deferLoad) {
    attrs.push('loading="eager"', 'fetchpriority="high"');
  }

  return `<div class="expanded-preview">
        <div class="expanded-preview__skeleton" aria-hidden="true"></div>
        <img ${attrs.join(' ')} />
      </div>`;
}

function renderRecipe(recipe: Decoration['recipe']): string {
  if (!recipe) {
    return '<p class="expanded-recipe-empty">No recipe data in catalog for this decoration.</p>';
  }

  // A rating of 0 means the item isn't crafted at a discipline, so it says nothing.
  const ratingRow = recipe.rating ? `<dt>Rating</dt><dd>${recipe.rating}</dd>` : '';
  const sheetRow = recipe.sheet
    ? `<dt>Recipe sheet</dt><dd class="expanded-recipe-break">${escapeHtml(recipe.sheet)}</dd>`
    : '';
  const meta = ratingRow || sheetRow ? `<dl class="expanded-recipe__meta">${ratingRow}${sheetRow}</dl>` : '';
  const ingredients =
    recipe.ingredients.length > 0
      ? `<ul class="expanded-recipe-list">${recipe.ingredients
          .map(
            (ingredient) =>
              `<li class="expanded-recipe-break">${ingredient.quantity != null ? `${ingredient.quantity}× ` : ''}${escapeHtml(ingredient.item)}</li>`
          )
          .join('')}</ul>`
      : '';

  return `<div class="expanded-recipe">
      <h3 class="expanded-recipe__title">Recipe</h3>
      ${meta}
      ${ingredients}
    </div>`;
}

function renderExpandedDecoration(
  decoration: Decoration,
  categoryMap: Map<number, string>,
  itemsPerRow: number,
  decorationIndex: number,
  deferPreviewLoad: boolean,
  iconHtml: string
): string {
  const step = ITEM_SIZE + ITEM_GAP;
  const indicatorLeft = `calc(50% + ${(decorationIndex % itemsPerRow) * step}px - ${(itemsPerRow * step - ITEM_GAP) / 2}px + ${ITEM_SIZE / 2}px)`;

  const categoryTags = decoration.categories
    .map((categoryId) => {
      const name = categoryMap.get(categoryId);
      return name ? `<span class="expanded-tag">${escapeHtml(name)}</span>` : '';
    })
    .join('');

  const wikiLink = decoration.wikiTitle
    ? `<a href="${escapeHtml(wikiArticleUrl(decoration.wikiTitle))}" class="expanded-wiki-link" target="_blank" rel="noopener noreferrer">View on Wiki →</a>`
    : '';

  const description = decoration.description
    ? `<p class="expanded-description">${escapeHtml(decoration.description)}</p>`
    : '';

  return `<div id="${EXPANDED_PANEL_ID}" class="expanded-decoration is-collapsed" data-expanded-for="${decoration.id}" role="region" aria-labelledby="${EXPANDED_PANEL_ID}-title">
    <div class="expanded-decoration-gradient">
      <div class="decoration-indicator" style="left: ${indicatorLeft}"></div>
      <div class="expanded-decoration__body">
        <div class="expanded-decoration__layout">
          <div class="expanded-decoration__media">
            ${renderPreview(decoration, decoration.name, deferPreviewLoad, iconHtml)}
          </div>
          <div class="expanded-decoration__details">
            <div class="expanded-heading">
              <h2 id="${EXPANDED_PANEL_ID}-title" class="expanded-title">${escapeHtml(decoration.name)}</h2>
              ${wikiLink}
            </div>
            ${description}
            <div class="expanded-tags">${categoryTags}</div>
            <div class="expanded-recipe-section">${renderRecipe(decoration.recipe)}</div>
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
  const clearFiltersButton = document.getElementById('clear-filters') as HTMLButtonElement | null;
  const homeLink = document.getElementById('home-link') as HTMLAnchorElement | null;
  const openChangelogButton = document.getElementById('open-changelog') as HTMLButtonElement | null;
  const changelogPanel = document.getElementById('changelog-panel') as HTMLDialogElement | null;
  const closeChangelogButton = document.getElementById('close-changelog');
  const changelogScrollTopButton = document.getElementById('changelog-scroll-top');
  const changelogTitleButton = document.getElementById('changelog-title');
  const changelogScrollContainer = document.getElementById('changelog-scroll');
  const prompt = document.getElementById('filter-prompt');
  const promptText = document.getElementById('filter-prompt-text');
  const promptNo = document.getElementById('filter-prompt-no') as HTMLButtonElement | null;
  const promptYes = document.getElementById('filter-prompt-yes') as HTMLButtonElement | null;
  const grid = document.getElementById('icon-grid');
  const emptyState = document.getElementById('empty-state');
  const loadError = document.getElementById('load-error');
  const loadRetryButton = document.getElementById('load-retry');
  const resultsCount = document.getElementById('results-count');
  const resultsStatus = document.getElementById('results-status');
  const tooltip = document.getElementById('catalog-tooltip');
  const header = document.querySelector<HTMLElement>('.header');
  const categoryCountOptions = document.querySelectorAll<HTMLOptionElement>('[data-category-count]');

  if (!searchInput || !categorySelect || !grid) {
    return;
  }

  // On phones the search box is narrow: shorten its placeholder to fit (same breakpoint as
  // the phone header in global.css).
  const fullPlaceholder = searchInput.placeholder;
  const phoneWidth = window.matchMedia('(max-width: 600px)');
  const syncSearchPlaceholder = () => {
    searchInput.placeholder = phoneWidth.matches ? 'Search' : fullPlaceholder;
  };
  syncSearchPlaceholder();

  // Grid items scroll into view below the sticky header (scroll-margin-top in global.css).
  if (header) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }).observe(header);
  }

  const basePath = baseUrl.replace(/\/$/, '');
  const catalogIndexPath = basePath ? `${basePath}/` : '/';
  const catalogBase = catalogUrl(baseUrl, 'catalog');
  const sheetUrls = JSON.parse(grid.dataset.spriteSheets ?? '[]') as string[];
  // Category names are already in the select; no need to fetch them.
  const categoryMap = new Map<number, string>(
    Array.from(categoryCountOptions, (option) => [Number(option.value), option.dataset.categoryName ?? ''])
  );

  /** Fetch the search index, showing an error with a Retry button until it arrives. */
  async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
    for (;;) {
      try {
        const response = await fetchOk(catalogUrl(baseUrl, 'catalog/search-index.json'));
        loadError?.classList.add('is-hidden');
        return (await response.json()) as SearchIndexEntry[];
      } catch (error) {
        console.error('Failed to load the catalog', error);
        if (!loadError || !loadRetryButton) {
          throw error;
        }
        loadError.classList.remove('is-hidden');
        await new Promise<void>((resolve) => {
          loadRetryButton.addEventListener('click', () => resolve(), { once: true });
        });
      }
    }
  }

  const searchIndex = await loadSearchIndex();
  const searchIndexById = new Map(searchIndex.map((entry) => [entry.id, entry]));
  const searchHaystacks = new Map(
    searchIndex.map((entry) => [entry.id, buildSearchHaystack(entry, categoryMap)])
  );
  const decorationCache = new Map<number, Decoration>();

  let searchTokens: string[] = [];
  let selectedCategory = 'all';
  let filteredIds = new Set<number>();
  let expandedItemId: number | null = null;
  let itemsPerRow = 0;
  let pendingOpenAfterFilterResetId: number | null = null;
  let focusAfterPendingOpen = false;
  let promptTarget: { id: number; name: string } | null = null;
  let promptReturnFocus: HTMLElement | null = null;
  let changelogScrollTop = Number(sessionStorage.getItem('changelogScrollTop') ?? '0');
  let gridItems: HTMLElement[] = [];
  const gridItemsById = new Map<number, HTMLElement>();
  /** The latest per-category counts, to relabel the select when the window crosses phone width. */
  let lastCounts: { searchCount: number; categoryCounts: Map<number, number> } | null = null;
  let resultsStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let announceResults = false;
  let changelogLoaded = false;
  let changelogLoading: Promise<void> | null = null;
  let activeExpandToken = 0;
  let panelRemovalToken = 0;

  async function loadDecoration(id: number): Promise<Decoration | undefined> {
    const cached = decorationCache.get(id);
    if (cached) {
      return cached;
    }

    try {
      const decoration = (await (await fetchOk(`${catalogBase}/decorations/${id}.json`)).json()) as Decoration;
      decorationCache.set(id, decoration);
      return decoration;
    } catch (error) {
      console.error(`Failed to load decoration ${id}`, error);
      return undefined;
    }
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
    itemsPerRow = Math.max(1, Math.floor((grid!.offsetWidth + ITEM_GAP) / (ITEM_SIZE + ITEM_GAP)));
  }

  function getVisibleGridItems(): HTMLElement[] {
    return gridItems.filter((item) => !item.classList.contains('is-hidden'));
  }

  function matchesSearch(entry: SearchIndexEntry): boolean {
    if (searchTokens.length === 0) {
      return true;
    }
    const haystack = searchHaystacks.get(entry.id) ?? '';
    return searchTokens.every((token) => haystack.includes(token));
  }

  function matchesCategory(entry: SearchIndexEntry): boolean {
    return selectedCategory === 'all' || entry.categories.includes(Number(selectedCategory));
  }

  function filtersActive(): boolean {
    return searchTokens.length > 0 || selectedCategory !== 'all';
  }

  /** Tell screen readers how many decorations the filters left, once typing pauses. */
  function scheduleResultsStatus(visibleCount: number): void {
    if (!resultsStatus) {
      return;
    }
    if (resultsStatusTimer != null) {
      clearTimeout(resultsStatusTimer);
    }
    resultsStatusTimer = setTimeout(() => {
      resultsStatusTimer = null;
      resultsStatus.textContent =
        visibleCount === 0
          ? 'No decorations found'
          : `${visibleCount.toLocaleString()} decoration${visibleCount === 1 ? '' : 's'}`;
    }, RESULTS_STATUS_DELAY_MS);
  }

  /**
   * "All categories (n)" and each category's count, for the current search. On phones the
   * select is narrow, so the first option reads "All (n)".
   */
  function updateCategoryCounts(searchCount: number, categoryCounts: Map<number, number>): void {
    const allOption = categorySelect!.querySelector('option[value="all"]');
    if (allOption) {
      allOption.textContent = `${phoneWidth.matches ? 'All' : 'All categories'} (${searchCount})`;
    }
    categoryCountOptions.forEach((option) => {
      option.textContent = `${option.dataset.categoryName} (${categoryCounts.get(Number(option.value)) ?? 0})`;
    });
  }

  function updateResultsCount(visibleCount: number): void {
    if (!resultsCount) {
      return;
    }
    const total = searchIndex.length.toLocaleString();
    resultsCount.textContent = filtersActive()
      ? `${visibleCount.toLocaleString()} of ${total} decorations`
      : `${total} decorations`;
  }

  function applyFilters(): void {
    // One pass: the visible set, plus per-category counts for the current search.
    const categoryCounts = new Map<number, number>();
    let searchCount = 0;
    filteredIds = new Set<number>();

    for (const entry of searchIndex) {
      if (!matchesSearch(entry)) {
        continue;
      }
      searchCount += 1;
      for (const categoryId of entry.categories) {
        categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
      }
      if (matchesCategory(entry)) {
        filteredIds.add(entry.id);
      }
    }

    for (const item of gridItems) {
      item.classList.toggle('is-hidden', !filteredIds.has(Number(item.dataset.id)));
    }

    const visibleCount = filteredIds.size;
    emptyState?.classList.toggle('is-hidden', visibleCount > 0);
    updateCategoryCounts(searchCount, categoryCounts);
    lastCounts = { searchCount, categoryCounts };
    updateResultsCount(visibleCount);
    if (clearFiltersButton) {
      clearFiltersButton.hidden = !filtersActive();
    }

    // The first pass runs at startup; only changes the visitor makes are announced.
    if (announceResults) {
      scheduleResultsStatus(visibleCount);
    }
    announceResults = true;

    if (expandedItemId != null && !filteredIds.has(expandedItemId)) {
      collapseExpanded();
    }

    if (pendingOpenAfterFilterResetId != null && filteredIds.has(pendingOpenAfterFilterResetId)) {
      const targetId = pendingOpenAfterFilterResetId;
      const focusTarget = focusAfterPendingOpen;
      pendingOpenAfterFilterResetId = null;
      focusAfterPendingOpen = false;
      void openDecorationFromDeepLink(targetId).then(() => {
        if (focusTarget) {
          gridItemsById.get(targetId)?.focus({ preventScroll: true });
        }
      });
    }
  }

  /** Keep aria-expanded / aria-controls on grid buttons in step with the open panel. */
  function markExpandedItem(id: number | null): void {
    if (expandedItemId != null && expandedItemId !== id) {
      const previous = gridItemsById.get(expandedItemId);
      previous?.setAttribute('aria-expanded', 'false');
      previous?.removeAttribute('aria-controls');
    }
    if (id != null) {
      const item = gridItemsById.get(id);
      item?.setAttribute('aria-expanded', 'true');
      item?.setAttribute('aria-controls', EXPANDED_PANEL_ID);
    }
  }

  function removeExpandedPanel(): void {
    grid!.querySelector('.expanded-decoration')?.remove();
  }

  /** Scroll an icon to just below the sticky header (its scroll-margin-top). */
  function scrollToItem(item: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    item.scrollIntoView({ block: 'start', behavior });
  }

  function loadDeferredPreview(panel: HTMLElement, delayMs: number): void {
    setTimeout(() => {
      const img = panel.querySelector<HTMLImageElement>('img[data-preview-src]');
      if (!img?.dataset.previewSrc) {
        return;
      }

      img.loading = 'eager';
      img.fetchPriority = 'high';
      if (img.dataset.previewSizes) {
        img.sizes = img.dataset.previewSizes;
      }
      if (img.dataset.previewSrcset) {
        img.srcset = img.dataset.previewSrcset;
      }
      img.src = img.dataset.previewSrc;
      img.removeAttribute('data-preview-src');
      img.removeAttribute('data-preview-srcset');
      img.removeAttribute('data-preview-sizes');
    }, delayMs);
  }

  /**
   * Side by side (1024px and up), the panel is sized to its content, up to 70% of the window:
   * the preview at the media column's width (or the no-preview block) beside the details.
   * Measured while the panel is still collapsed; widths and scrollHeight don't depend on its
   * height. Stacked (narrower), it returns null: the panel takes its content's height and the
   * page scrolls (see global.css).
   */
  function measurePanelHeight(panel: HTMLElement, decoration: Decoration): number | null {
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      return null;
    }

    const maxHeight = Math.max(Math.round(window.innerHeight * PANEL_MAX_VIEWPORT_SHARE), PANEL_MIN_HEIGHT);
    const media = panel.querySelector<HTMLElement>('.expanded-decoration__media');
    const details = panel.querySelector<HTMLElement>('.expanded-decoration__details');
    if (!media || !details) {
      return maxHeight;
    }

    const preview = decoration.preview;
    const mediaHeight = preview
      ? Math.min(preview.height, (media.clientWidth * preview.height) / preview.width) + PANEL_MEDIA_PADDING
      : MISSING_PREVIEW_HEIGHT;
    const contentHeight = Math.max(mediaHeight, details.scrollHeight);
    return Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, Math.ceil(contentHeight)));
  }

  function collapseExpanded(): void {
    activeExpandToken += 1;

    const removalToken = ++panelRemovalToken;
    const panel = grid!.querySelector<HTMLElement>('.expanded-decoration');
    if (panel) {
      const removeIfCurrent = () => {
        if (removalToken === panelRemovalToken) {
          removeExpandedPanel();
        }
      };
      if (prefersReducedMotion()) {
        removeIfCurrent();
      } else {
        // Any running expand would fight the collapse; stop it and collapse from where it is.
        const height = panel.getBoundingClientRect().height;
        const { marginBottom } = getComputedStyle(panel);
        panel.getAnimations().forEach((animation) => animation.cancel());
        panel.classList.add('is-closing');
        const animation = animatePanelSize(panel, { height, marginBottom }, { height: 0, marginBottom: '0px' });
        // Hold the collapsed size until the panel is removed, so it doesn't spring back.
        animation.effect?.updateTiming({ fill: 'forwards' });
        animation.addEventListener('finish', removeIfCurrent);
      }
    }
    markExpandedItem(null);
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

  /** A decoration's icon drawn from its sprite sheet, enlarged, for the no-preview block. */
  function largeIconHtml(id: number): string {
    const sprite = searchIndexById.get(id)?.sprite;
    return sprite
      ? `<span class="expanded-preview__icon sprite-icon" style="${escapeHtml(spriteStyle(sprite, sheetUrls))}" aria-hidden="true"></span>`
      : '';
  }

  async function insertExpandedPanel(
    decorationId: number,
    animate: boolean,
    token: number,
    options: {
      scroll?: ScrollBehavior;
      deferPreview?: boolean;
      preScroll?: boolean;
    } = {}
  ): Promise<void> {
    const visibleItems = getVisibleGridItems();
    const decorationIndex = visibleItems.findIndex((item) => Number(item.dataset.id) === decorationId);
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

    const decoration = await loadDecoration(decorationId);
    if (token !== activeExpandToken || !decoration) {
      return;
    }

    panelRemovalToken += 1;
    removeExpandedPanel();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderExpandedDecoration(
      decoration,
      categoryMap,
      itemsPerRow,
      decorationIndex,
      options.deferPreview ?? false,
      largeIconHtml(decorationId)
    );
    const panel = wrapper.firstElementChild as HTMLElement | null;
    if (!panel) {
      return;
    }

    insertAfter.insertAdjacentElement('afterend', panel);
    const panelHeight = measurePanelHeight(panel, decoration);
    if (panelHeight != null) {
      panel.style.height = `${panelHeight}px`;
    }

    if (animate && !prefersReducedMotion()) {
      panel.classList.remove('is-collapsed');
      // Open size: the measured height side by side, or the content's natural height stacked.
      const { marginBottom } = getComputedStyle(panel);
      const height = panelHeight ?? panel.getBoundingClientRect().height;
      animatePanelSize(panel, { height: 0, marginBottom: '0px' }, { height, marginBottom });
      if (!options.preScroll) {
        setTimeout(() => scrollToItem(clickedItem, scrollBehavior), 50);
      }
    } else {
      panel.classList.remove('is-collapsed');
      if (!options.preScroll) {
        scrollToItem(clickedItem, scrollBehavior);
      }
    }

    if (options.deferPreview) {
      loadDeferredPreview(panel, DEFERRED_PREVIEW_DELAY_MS);
    }

    markExpandedItem(decorationId);
    expandedItemId = decorationId;
    updateDeepLink(decorationId);
  }

  async function openDecorationById(
    id: number,
    options: { animate?: boolean; scroll?: ScrollBehavior; deferPreview?: boolean } = {}
  ): Promise<void> {
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
    const isPanelSwap = expandedItemId != null;
    const currentIndex = isPanelSwap
      ? visibleItems.findIndex((item) => Number(item.dataset.id) === expandedItemId)
      : -1;
    const isSameRow =
      currentIndex >= 0 && Math.floor(newIndex / itemsPerRow) === Math.floor(currentIndex / itemsPerRow);

    await insertExpandedPanel(id, isPanelSwap ? false : (options.animate ?? true), token, {
      scroll: isPanelSwap ? 'auto' : options.scroll,
      deferPreview: options.deferPreview,
      preScroll: isPanelSwap && !isSameRow,
    });
  }

  async function openDecorationFromDeepLink(id: number): Promise<void> {
    const item = getVisibleGridItems().find((element) => Number(element.dataset.id) === id);
    if (item && !isItemNearViewport(item)) {
      scrollToItem(item, 'auto');
      await waitForNextFrame(2);
    }

    await openDecorationById(id, { animate: false, scroll: 'auto', deferPreview: true });
  }

  function clearFilters(): void {
    searchTokens = [];
    selectedCategory = 'all';
    searchInput!.value = '';
    categorySelect!.value = 'all';
    clearSearchButton?.classList.add('is-hidden');
    applyFilters();
  }

  function handleHomeReset(): void {
    clearFilters();
    collapseExpanded();
    hidePrompt(false);
    pendingOpenAfterFilterResetId = null;
    closeChangelog();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * The small prompt in the corner. With a target, the decoration is hidden by filters and
   * the prompt offers to clear them; without one, it is a notice with a single OK button.
   */
  function showPrompt(text: string, target: { id: number; name: string } | null): void {
    if (!prompt || !promptText || !promptNo || !promptYes) {
      return;
    }
    promptTarget = target;
    promptText.textContent = text;
    promptYes.hidden = target == null;
    promptNo.textContent = target == null ? 'OK' : 'Keep filters';
    const active = document.activeElement;
    promptReturnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    prompt.classList.remove('is-hidden');
    (target == null ? promptNo : promptYes).focus();
  }

  function hidePrompt(restoreFocus: boolean): void {
    if (!prompt || prompt.classList.contains('is-hidden')) {
      return;
    }
    promptTarget = null;
    prompt.classList.add('is-hidden');
    if (restoreFocus && promptReturnFocus?.isConnected) {
      promptReturnFocus.focus({ preventScroll: true });
    }
    promptReturnFocus = null;
  }

  async function handleChangelogEntryClick(id: number, name: string): Promise<void> {
    closeChangelog();

    if (filteredIds.has(id)) {
      await openDecorationById(id);
      // Closing the dialog returned focus to its trigger; move it to the decoration just opened.
      gridItemsById.get(id)?.focus({ preventScroll: true });
      return;
    }

    if (searchIndexById.has(id)) {
      showPrompt(`${name} is hidden by your search or category filter.`, { id, name });
    }
  }

  function openChangelog(): void {
    if (!changelogPanel || changelogPanel.open) {
      return;
    }
    hideTooltip();
    // A modal <dialog> brings focus, focus trapping, Escape and the backdrop with it.
    changelogPanel.showModal();
    void ensureChangelogLoaded().then(() => {
      if (changelogScrollContainer && changelogPanel.open) {
        changelogScrollContainer.scrollTop = changelogScrollTop;
      }
    });
  }

  async function ensureChangelogLoaded(): Promise<void> {
    if (changelogLoaded || !changelogScrollContainer) {
      return;
    }
    changelogLoading ??= (async () => {
      try {
        const html = await (await fetchOk(catalogUrl(baseUrl, 'catalog/changelog.html'))).text();
        changelogScrollContainer.innerHTML = html;
        const now = new Date();
        changelogScrollContainer.querySelectorAll<HTMLElement>('[data-relative-day]').forEach((element) => {
          element.textContent = `${relativeDay(element.dataset.relativeDay ?? '', now)} · `;
        });
        changelogLoaded = true;
      } catch (error) {
        console.error('Failed to load Recently Added', error);
        changelogScrollContainer.innerHTML =
          '<p class="changelog-panel__empty">Couldn\'t load recently added decorations. <button type="button" class="changelog-panel__retry" data-changelog-retry>Retry</button></p>';
      } finally {
        changelogLoading = null;
      }
    })();
    await changelogLoading;
  }

  function closeChangelog(): void {
    if (changelogPanel?.open) {
      changelogPanel.close();
    }
  }

  /**
   * Runs on every close, Escape included. The position is tracked while the list scrolls,
   * since by the time `close` fires the dialog is hidden and its scrollTop reads 0.
   */
  function rememberChangelogScroll(): void {
    sessionStorage.setItem('changelogScrollTop', String(changelogScrollTop));
  }

  function scrollChangelogToTop(): void {
    changelogScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildGrid(): void {
    gridItems = searchIndex.map((entry) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'catalog-item';
      item.dataset.id = String(entry.id);
      item.setAttribute('aria-label', entry.name);
      item.setAttribute('aria-expanded', 'false');
      item.innerHTML = '<span class="catalog-icon sprite-icon" aria-hidden="true"></span>';
      item.addEventListener('click', () => {
        hideTooltip();
        void openDecorationById(entry.id);
      });
      gridItemsById.set(entry.id, item);
      return item;
    });
    grid!.replaceChildren(...gridItems);
  }

  // Icons: each one is drawn from a sprite sheet once its row nears the viewport. A sheet is
  // fetched once and shared by its ~100 icons. Hidden items never intersect, so filtering
  // needs no extra bookkeeping: icons load when their items show up.
  const sheetLoads = new Map<number, Promise<void>>();

  function loadSheet(sheet: number): Promise<void> {
    let load = sheetLoads.get(sheet);
    if (!load) {
      load = new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Failed to load ${sheetUrls[sheet]}`));
        image.src = sheetUrls[sheet];
      });
      // A failed sheet can be tried again by the next icon that needs it.
      load.catch(() => sheetLoads.delete(sheet));
      sheetLoads.set(sheet, load);
    }
    return load;
  }

  function markIconMissing(icon: HTMLElement): void {
    icon.classList.add('catalog-icon--missing', 'is-loaded');
    icon.textContent = '?';
  }

  function showIcon(item: HTMLElement): void {
    const icon = item.firstElementChild as HTMLElement | null;
    const sprite = searchIndexById.get(Number(item.dataset.id))?.sprite;
    if (!icon) {
      return;
    }
    if (!sprite) {
      markIconMissing(icon);
      return;
    }
    loadSheet(sprite[0]).then(
      () => {
        icon.setAttribute('style', spriteStyle(sprite, sheetUrls));
        icon.classList.add('is-loaded');
      },
      () => markIconMissing(icon)
    );
  }

  const iconObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const item = entry.target as HTMLElement;
          iconObserver.unobserve(item);
          showIcon(item);
        }
      }
    },
    { rootMargin: ICON_ROOT_MARGIN }
  );

  // Name tooltip for grid icons (U1). One shared element, positioned over whichever icon is
  // hovered or keyboard-focused. Purely visual: each button already carries an aria-label.
  let tooltipTarget: HTMLElement | null = null;
  let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  let tooltipWarmUntil = 0;

  function positionTooltip(item: HTMLElement): void {
    if (!tooltip) {
      return;
    }
    const gap = 8;
    const edge = 8;
    const itemRect = item.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;

    let placement: 'top' | 'bottom' = 'top';
    let top = itemRect.top - tipRect.height - gap;
    if (top < headerBottom + edge) {
      placement = 'bottom';
      top = itemRect.bottom + gap;
    }

    const centerX = itemRect.left + itemRect.width / 2;
    const maxLeft = window.innerWidth - tipRect.width - edge;
    const left = Math.max(edge, Math.min(centerX - tipRect.width / 2, maxLeft));

    tooltip.dataset.placement = placement;
    tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tooltip.style.setProperty('--tooltip-arrow-x', `${Math.round(centerX - left)}px`);
  }

  function showTooltip(item: HTMLElement): void {
    if (!tooltip || !item.isConnected || item.classList.contains('is-hidden')) {
      return;
    }
    tooltipTarget = item;
    tooltip.textContent = item.getAttribute('aria-label') ?? '';
    tooltip.hidden = false;
    positionTooltip(item);
    tooltip.classList.add('is-visible');
  }

  function scheduleTooltip(item: HTMLElement): void {
    if (item === tooltipTarget) {
      return;
    }
    if (tooltipTimer != null) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (tooltipTarget || performance.now() < tooltipWarmUntil) {
      showTooltip(item);
      return;
    }
    tooltipTimer = setTimeout(() => {
      tooltipTimer = null;
      showTooltip(item);
    }, TOOLTIP_DELAY_MS);
  }

  function hideTooltip(): void {
    if (tooltipTimer != null) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (!tooltipTarget || !tooltip) {
      return;
    }
    tooltipTarget = null;
    tooltipWarmUntil = performance.now() + TOOLTIP_WARM_MS;
    tooltip.classList.remove('is-visible');
    tooltip.hidden = true;
  }

  function gridItemFromEvent(event: Event): HTMLElement | null {
    return (event.target as HTMLElement | null)?.closest<HTMLElement>('.catalog-item') ?? null;
  }

  grid.addEventListener('pointerover', (event) => {
    const item = gridItemFromEvent(event);
    if (item && event.pointerType !== 'touch') {
      scheduleTooltip(item);
    }
  });
  grid.addEventListener('pointerout', (event) => {
    const item = gridItemFromEvent(event);
    const next = (event.relatedTarget as HTMLElement | null)?.closest?.('.catalog-item');
    if (item && next !== item) {
      hideTooltip();
    }
  });
  grid.addEventListener('focusin', (event) => {
    const item = gridItemFromEvent(event);
    if (item && item.matches(':focus-visible')) {
      scheduleTooltip(item);
    }
  });
  grid.addEventListener('focusout', hideTooltip);
  window.addEventListener('scroll', hideTooltip, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || changelogPanel?.open) {
      return;
    }

    if (tooltipTarget || tooltipTimer != null) {
      hideTooltip();
      return;
    }

    if (prompt && !prompt.classList.contains('is-hidden')) {
      hidePrompt(true);
      return;
    }

    if (expandedItemId == null) {
      return;
    }

    const item = gridItemsById.get(expandedItemId);
    const active = document.activeElement;
    // Return focus to the icon unless the visitor is working in the search box or a select.
    const returnFocus = !active || active === document.body || grid.contains(active);
    collapseExpanded();
    if (returnFocus && item && !item.classList.contains('is-hidden')) {
      item.focus({ preventScroll: true });
    }
  });

  searchInput.addEventListener('input', () => {
    searchTokens = tokenizeQuery(searchInput.value);
    clearSearchButton?.classList.toggle('is-hidden', searchInput.value.length === 0);
    applyFilters();
  });

  clearSearchButton?.addEventListener('click', () => {
    searchTokens = [];
    searchInput.value = '';
    clearSearchButton.classList.add('is-hidden');
    applyFilters();
    searchInput.focus();
  });

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    applyFilters();
  });

  clearFiltersButton?.addEventListener('click', () => {
    clearFilters();
    searchInput.focus();
  });

  // The brand is a real link to the home page (so it can open in a new tab); a plain click
  // resets in place instead of reloading.
  homeLink?.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    handleHomeReset();
  });

  openChangelogButton?.addEventListener('click', openChangelog);
  closeChangelogButton?.addEventListener('click', closeChangelog);
  changelogPanel?.addEventListener('close', rememberChangelogScroll);
  changelogScrollContainer?.addEventListener(
    'scroll',
    () => {
      if (changelogLoaded && changelogPanel?.open) {
        changelogScrollTop = changelogScrollContainer.scrollTop;
      }
    },
    { passive: true }
  );
  // The dialog's own box is covered by its header and list, so a click that lands on the
  // dialog element itself came from the backdrop.
  changelogPanel?.addEventListener('click', (event) => {
    if (event.target === changelogPanel) {
      closeChangelog();
    }
  });
  changelogScrollTopButton?.addEventListener('click', scrollChangelogToTop);
  changelogTitleButton?.addEventListener('click', scrollChangelogToTop);

  changelogScrollContainer?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-changelog-retry]')) {
      void ensureChangelogLoaded();
      return;
    }

    const entry = target?.closest<HTMLButtonElement>('[data-changelog-entry]');
    if (entry) {
      void handleChangelogEntryClick(Number(entry.dataset.changelogEntry), entry.dataset.changelogName ?? '');
    }
  });

  promptNo?.addEventListener('click', () => hidePrompt(true));
  promptYes?.addEventListener('click', () => {
    if (!promptTarget) {
      return;
    }
    const targetId = promptTarget.id;
    hidePrompt(false);
    pendingOpenAfterFilterResetId = targetId;
    focusAfterPendingOpen = true;
    clearFilters();
  });

  phoneWidth.addEventListener('change', () => {
    syncSearchPlaceholder();
    if (lastCounts) {
      updateCategoryCounts(lastCounts.searchCount, lastCounts.categoryCounts);
    }
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
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
      if (expandedItemId != null) {
        void insertExpandedPanel(expandedItemId, false, activeExpandToken);
      }
    }, 150);
  });

  buildGrid();
  calculateItemsPerRow();
  applyFilters();
  gridItems.forEach((item) => iconObserver.observe(item));
  syncCatalogUrl(new URL(window.location.href));

  const openParam = new URLSearchParams(window.location.search).get('open');
  const deepLinkId = openParam && /^\d+$/.test(openParam) ? Number(openParam) : null;
  if (deepLinkId == null) {
    return;
  }

  // No filters are active yet, so every decoration in the index is in the grid.
  if (searchIndexById.has(deepLinkId)) {
    requestAnimationFrame(() => {
      void openDecorationFromDeepLink(deepLinkId);
    });
  } else {
    // Not in the catalog: a decoration that left the game still has its JSON, so say so.
    const decoration = await loadDecoration(deepLinkId);
    updateDeepLink(null);
    if (decoration?.removed) {
      showPrompt(`${decoration.name} was removed from the game on ${formatDay(decoration.removed)}.`, null);
    }
  }
}
