export type ImageLoadState = 'loading' | 'loaded' | 'error' | 'missing';

function setImageState(frame: HTMLElement, state: ImageLoadState): void {
  frame.dataset.imageState = state;
}

export function wireImageFrame(frame: HTMLElement): void {
  if (frame.dataset.imageWired === 'true') {
    return;
  }
  frame.dataset.imageWired = 'true';

  const initialState = frame.dataset.imageState as ImageLoadState | undefined;
  if (initialState === 'missing' || initialState === 'error') {
    return;
  }

  const img = frame.querySelector<HTMLImageElement>('.image-frame__img');
  if (!img) {
    setImageState(frame, 'error');
    return;
  }

  const finish = (state: ImageLoadState) => setImageState(frame, state);

  if (img.complete) {
    finish(img.naturalWidth > 0 ? 'loaded' : 'error');
    return;
  }

  finish('loading');
  img.addEventListener('load', () => finish('loaded'), { once: true });
  img.addEventListener('error', () => finish('error'), { once: true });
}

export function wireImageFrames(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.image-frame').forEach(wireImageFrame);
}
