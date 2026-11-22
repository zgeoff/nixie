export interface ScreenPixels {
  readonly width: number;
  readonly height: number;
}

// The size of this window in device pixels, which is what the server keeps for the device.
export function readScreenPixels(): ScreenPixels {
  return {
    width: Math.max(1, Math.round(globalThis.innerWidth * globalThis.devicePixelRatio)),
    height: Math.max(1, Math.round(globalThis.innerHeight * globalThis.devicePixelRatio)),
  };
}
