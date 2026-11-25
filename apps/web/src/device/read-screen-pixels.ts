export interface ScreenPixels {
  readonly width: number;
  readonly height: number;

  // device pixels per CSS pixel, so the CSS size is the width divided by it
  readonly pixelRatio: number;

  // the browser's time zone, which the server shows a clock region in for a preview
  readonly timeZone?: string;
}

// The size of this window in device pixels, and the ratio of those to CSS pixels, which is what the
// server keeps for the device, with the zone its clocks show.
export function readScreenPixels(): ScreenPixels {
  return {
    width: Math.max(1, Math.round(globalThis.innerWidth * globalThis.devicePixelRatio)),
    height: Math.max(1, Math.round(globalThis.innerHeight * globalThis.devicePixelRatio)),
    pixelRatio: globalThis.devicePixelRatio,
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
