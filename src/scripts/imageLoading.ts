export type ImageLoadState = 'loading' | 'loaded' | 'error' | 'missing';

const STATE_CLASSES: ImageLoadState[] = ['loading', 'loaded', 'error', 'missing'];

function setImageState(frame: HTMLElement, state: ImageLoadState): void {
  frame.dataset.imageState = state;
  frame.classList.remove(...STATE_CLASSES.map((value) => `is-${value}`));
  frame.classList.add(`is-${state}`);
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

  const finish = (state: ImageLoadState) => setImageState(frame, state);

  const handleLoad = () => finish('loaded');
  const handleError = () => finish('error');

  if (img.complete) {
    finish(img.naturalWidth > 0 ? 'loaded' : 'error');
    return;
  }

  finish('loading');
  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });
}

export function wireImageFrames(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.image-frame').forEach((frame) => {
    if (!frame.classList.contains('is-loading') &&
        !frame.classList.contains('is-loaded') &&
        !frame.classList.contains('is-error') &&
        !frame.classList.contains('is-missing')) {
      frame.classList.add('is-loading');
    }
    wireImageFrame(frame);
  });
}
