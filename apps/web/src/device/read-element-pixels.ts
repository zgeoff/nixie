import type { ScreenPixels } from './read-screen-pixels';

export function readElementPixels(element: Element): ScreenPixels {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width * globalThis.devicePixelRatio)),
    height: Math.max(1, Math.round(rect.height * globalThis.devicePixelRatio)),
    pixelRatio: globalThis.devicePixelRatio,
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
