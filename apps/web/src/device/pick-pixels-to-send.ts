import type { ScreenPixels } from './read-screen-pixels';

// The size to send after a resize, or null while the server already has it.
export function pickPixelsToSend(sent: ScreenPixels, current: ScreenPixels): ScreenPixels | null {
  const isSame =
    sent.width === current.width &&
    sent.height === current.height &&
    sent.pixelRatio === current.pixelRatio;

  return isSame ? null : current;
}
