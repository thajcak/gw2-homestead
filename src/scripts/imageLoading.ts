export type ImageLoadState = 'pending' | 'loading' | 'loaded' | 'error' | 'missing';

const STATE_CLASSES: ImageLoadState[] = ['pending', 'loading', 'loaded', 'error', 'missing'];
const WIRE_BATCH_SIZE = 10;
const REVEAL_BATCH_SIZE = 16;
const OBSERVER_ROOT_MARGIN = '120px 0px';

let frameObserver: IntersectionObserver | null = null;
const wireQueue: HTMLElement[] = [];
let wireFlushScheduled = false;
const revealQueue: Array<() => void> = [];
let revealFlushScheduled = false;

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

function queueReveal(task: () => void): void {
  revealQueue.push(task);
  if (revealFlushScheduled) {
    return;
  }
  revealFlushScheduled = true;
  requestAnimationFrame(flushRevealQueue);
}

function flushRevealQueue(): void {
  const batch = revealQueue.splice(0, REVEAL_BATCH_SIZE);
  for (const task of batch) {
    task();
  }
  if (revealQueue.length > 0) {
    requestAnimationFrame(flushRevealQueue);
    return;
  }
  revealFlushScheduled = false;
}

function revealExpanded(frame: HTMLElement, img: HTMLImageElement): void {
  const reveal = () => markLoaded(frame, img);
  if (typeof img.decode === 'function') {
    img.decode().then(reveal).catch(reveal);
    return;
  }
  reveal();
}

function revealIcon(frame: HTMLElement, img: HTMLImageElement): void {
  queueReveal(() => markLoaded(frame, img));
}

function scheduleWire(frame: HTMLElement): void {
  wireQueue.push(frame);
  if (wireFlushScheduled) {
    return;
  }
  wireFlushScheduled = true;
  requestAnimationFrame(flushWireQueue);
}

function flushWireQueue(): void {
  const batch = wireQueue.splice(0, WIRE_BATCH_SIZE);
  for (const frame of batch) {
    wireImageFrame(frame);
  }
  if (wireQueue.length > 0) {
    requestAnimationFrame(flushWireQueue);
    return;
  }
  wireFlushScheduled = false;
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
          scheduleWire(entry.target as HTMLElement);
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );
  }
  return frameObserver;
}

export function wireImageFrame(frame: HTMLElement): void {
  if (frame.dataset.imageWired === 'true') {
    return;
  }
  frame.dataset.imageWired = 'true';

  const initialState = frame.dataset.imageState as ImageLoadState | undefined;
  if (initialState === 'missing' || initialState === 'error') {
    setImageState(frame, initialState);
    return;
  }

  const img = frame.querySelector<HTMLImageElement>('.image-frame__img');
  if (!img) {
    setImageState(frame, 'error');
    return;
  }

  const isExpanded = frame.classList.contains('image-frame--expanded');
  setImageState(frame, 'loading');

  const deferredSrc = img.dataset.src;
  if (deferredSrc && !img.getAttribute('src')) {
    img.src = deferredSrc;
  }

  const handleLoad = () => {
    if (isExpanded) {
      revealExpanded(frame, img);
      return;
    }
    revealIcon(frame, img);
  };
  const handleError = () => setImageState(frame, 'error');

  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });

  if (img.complete) {
    handleLoad();
  }
}

export function wireImageFrames(root: ParentNode = document): void {
  const frames = root.querySelectorAll<HTMLElement>(
    '.image-frame:not([data-image-wired="true"])'
  );
  const observer = 'IntersectionObserver' in window ? getFrameObserver() : null;
  const immediate: HTMLElement[] = [];

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
      immediate.push(frame);
      continue;
    }

    const item = frame.closest('.catalog-item');
    if (item?.classList.contains('is-hidden')) {
      continue;
    }

    if (observer) {
      observer.observe(frame);
    } else {
      immediate.push(frame);
    }
  }

  for (const frame of immediate) {
    scheduleWire(frame);
  }
}
