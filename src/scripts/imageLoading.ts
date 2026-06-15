export type ImageLoadState = 'pending' | 'loading' | 'loaded' | 'error' | 'missing';

const STATE_CLASSES: ImageLoadState[] = ['pending', 'loading', 'loaded', 'error', 'missing'];

function setImageState(frame: HTMLElement, state: ImageLoadState): void {
  frame.dataset.imageState = state;
  frame.classList.remove(...STATE_CLASSES.map((value) => `is-${value}`));
  frame.classList.add(`is-${state}`);
}

function markLoaded(frame: HTMLElement, img: HTMLImageElement): void {
  if (img.naturalWidth === 0) {
    setImageState(frame, 'error');
    return;
  }
  setImageState(frame, 'loaded');
}

function finishWhenReady(frame: HTMLElement, img: HTMLImageElement): void {
  const reveal = () => {
    if (img.naturalWidth === 0) {
      setImageState(frame, 'error');
      return;
    }
    markLoaded(frame, img);
  };

  requestAnimationFrame(() => {
    if (typeof img.decode === 'function') {
      img.decode().then(reveal).catch(reveal);
      return;
    }
    requestAnimationFrame(reveal);
  });
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

  setImageState(frame, 'loading');

  const deferredSrc = img.dataset.src;
  if (deferredSrc && !img.getAttribute('src')) {
    img.src = deferredSrc;
  }

  const handleLoad = () => finishWhenReady(frame, img);
  const handleError = () => setImageState(frame, 'error');

  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });

  if (img.complete) {
    handleLoad();
    return;
  }

  requestAnimationFrame(() => {
    if (frame.classList.contains('is-loaded') || frame.classList.contains('is-error')) {
      return;
    }
    if (img.complete) {
      handleLoad();
    }
  });
}

export function wireImageFrames(root: ParentNode = document): void {
  const frames = Array.from(root.querySelectorAll<HTMLElement>('.image-frame'));

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
  }

  const pending = frames.filter((frame) => {
    if (frame.dataset.imageWired === 'true') {
      return false;
    }
    if (frame.classList.contains('image-frame--expanded')) {
      wireImageFrame(frame);
      return false;
    }
    const item = frame.closest('.catalog-item');
    if (item?.classList.contains('is-hidden')) {
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    return;
  }

  if (!('IntersectionObserver' in window)) {
    pending.forEach(wireImageFrame);
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        wireImageFrame(entry.target as HTMLElement);
        obs.unobserve(entry.target);
      }
    },
    { rootMargin: '300px 0px' }
  );

  pending.forEach((frame) => observer.observe(frame));
}
