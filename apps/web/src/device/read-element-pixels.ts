import type { ScreenPixels } from './read-screen-pixels';

// The size of an element in device pixels, with the ratio of those to CSS pixels and the zone its
// clocks show, the way the server keeps it for the device.
export function readElementPixels(element: Element): ScreenPixels {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width * globalThis.devicePixelRatio)),
    height: Math.max(1, Math.round(rect.height * globalThis.devicePixelRatio)),
    pixelRatio: globalThis.devicePixelRatio,
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
