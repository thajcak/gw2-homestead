export type ImageLoadState = 'pending' | 'loading' | 'loaded' | 'error' | 'missing';

const STATE_CLASSES: ImageLoadState[] = ['pending', 'loading', 'loaded', 'error', 'missing'];
const MAX_CONCURRENT_ICON_LOADS = 6;
const OBSERVER_ROOT_MARGIN = '80px 0px';

let frameObserver: IntersectionObserver | null = null;
const iconLoadQueue: HTMLElement[] = [];
let activeIconLoads = 0;

function setImageState(frame: HTMLElement, state: ImageLoadState): void {
  if (frame.dataset.imageState === state) {
    return;
  }
  frame.dataset.imageState = state;
  for (const value of STATE_CLASSES) {
    frame.classList.toggle(`is-${value}`, value === state);
  }
}

function markLoaded(frame: HTMLElement, img: HTMLImageElement): void {
  if (img.naturalWidth === 0) {
    setImageState(frame, 'error');
    return;
  }
  setImageState(frame, 'loaded');
}

function isFrameScheduled(frame: HTMLElement): boolean {
  return frame.dataset.imageWired === 'true' || frame.dataset.imageQueued === 'true';
}

function enqueueIconLoad(frame: HTMLElement): void {
  if (isFrameScheduled(frame)) {
    return;
  }

  frame.dataset.imageQueued = 'true';
  iconLoadQueue.push(frame);
  processIconLoadQueue();
}

function processIconLoadQueue(): void {
  while (activeIconLoads < MAX_CONCURRENT_ICON_LOADS && iconLoadQueue.length > 0) {
    const frame = iconLoadQueue.shift();
    if (!frame) {
      return;
    }
    delete frame.dataset.imageQueued;
    beginImageLoad(frame);
  }
}

function releaseIconLoadSlot(): void {
  activeIconLoads = Math.max(0, activeIconLoads - 1);
  processIconLoadQueue();
}

function beginImageLoad(frame: HTMLElement, options: { bypassConcurrencyLimit?: boolean } = {}): void {
  if (frame.dataset.imageWired === 'true') {
    return;
  }

  const reserved = !options.bypassConcurrencyLimit;
  if (reserved) {
    activeIconLoads += 1;
  }

  const release = () => {
    if (reserved) {
      releaseIconLoadSlot();
    }
  };

  frame.dataset.imageWired = 'true';
  delete frame.dataset.imageQueued;

  const initialState = frame.dataset.imageState as ImageLoadState | undefined;
  if (initialState === 'missing' || initialState === 'error') {
    setImageState(frame, initialState);
    release();
    return;
  }

  const img = frame.querySelector<HTMLImageElement>('.image-frame__img');
  if (!img) {
    setImageState(frame, 'error');
    release();
    return;
  }

  const isExpanded = frame.classList.contains('image-frame--expanded');
  setImageState(frame, 'loading');

  const deferredSrc = img.dataset.src;
  if (deferredSrc && !img.getAttribute('src')) {
    img.src = deferredSrc;
  }

  const handleLoad = () => {
    release();
    if (isExpanded && typeof img.decode === 'function') {
      img.decode().then(() => markLoaded(frame, img)).catch(() => markLoaded(frame, img));
      return;
    }
    markLoaded(frame, img);
  };

  const handleError = () => {
    release();
    setImageState(frame, 'error');
  };

  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });

  if (img.complete) {
    handleLoad();
  }
}

function getFrameObserver(): IntersectionObserver {
  if (!frameObserver) {
    frameObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          observer.unobserve(entry.target);
          enqueueIconLoad(entry.target as HTMLElement);
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );
  }
  return frameObserver;
}

/** Start loading a single frame immediately (expanded previews bypass the icon queue). */
export function wireImageFrame(frame: HTMLElement): void {
  const bypass = frame.classList.contains('image-frame--expanded');
  if (bypass) {
    beginImageLoad(frame, { bypassConcurrencyLimit: true });
    return;
  }
  enqueueIconLoad(frame);
}

export function wireImageFrames(root: ParentNode = document): void {
  const frames = root.querySelectorAll<HTMLElement>(
    '.image-frame:not([data-image-wired="true"]):not([data-image-queued="true"])'
  );
  const observer = 'IntersectionObserver' in window ? getFrameObserver() : null;

  for (const frame of frames) {
    if (
      !frame.classList.contains('is-pending') &&
      !frame.classList.contains('is-loading') &&
      !frame.classList.contains('is-loaded') &&
      !frame.classList.contains('is-error') &&
      !frame.classList.contains('is-missing')
    ) {
      setImageState(frame, 'pending');
    }

    if (frame.classList.contains('image-frame--expanded')) {
      wireImageFrame(frame);
      continue;
    }

    const item = frame.closest('.catalog-item');
    if (item?.classList.contains('is-hidden')) {
      continue;
    }

    if (observer) {
      observer.observe(frame);
      continue;
    }

    enqueueIconLoad(frame);
  }
}
