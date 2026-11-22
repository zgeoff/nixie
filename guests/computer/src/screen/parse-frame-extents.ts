export interface FrameExtents {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

// Reads `_NET_FRAME_EXTENTS(CARDINAL) = 1, 1, 20, 1`, the width of the window manager's frame on the
// left, right, top and bottom of a window. A window with no frame, or no property, has none.
export function parseFrameExtents(output: string): FrameExtents {
  const numbers = [...output.matchAll(/\d+/gu)].map((found) => Number(found[0]));
  const [left = 0, right = 0, top = 0, bottom = 0] = numbers.length === 4 ? numbers : [];

  return { left, right, top, bottom };
}
