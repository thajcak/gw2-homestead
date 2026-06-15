export type ImageLoadState = 'loading' | 'loaded' | 'error' | 'missing';

const STATE_CLASSES: ImageLoadState[] = ['loading', 'loaded', 'error', 'missing'];

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

  const handleLoad = () => markLoaded(frame, img);
  const handleError = () => setImageState(frame, 'error');

  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });

  if (img.complete) {
    handleLoad();
    return;
  }

  // Lazy-loaded images can finish after the first complete check.
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
  root.querySelectorAll<HTMLElement>('.image-frame').forEach((frame) => {
    if (
      !frame.classList.contains('is-loading') &&
      !frame.classList.contains('is-loaded') &&
      !frame.classList.contains('is-error') &&
      !frame.classList.contains('is-missing')
    ) {
      frame.classList.add('is-loading');
    }
    wireImageFrame(frame);
  });
}
