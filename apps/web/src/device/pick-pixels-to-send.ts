import type { ScreenPixels } from './read-screen-pixels';

// The size to send after a resize, or null while the server already has it. Nothing sent yet means
// the server may hold another size.
export function pickPixelsToSend(
  sent: ScreenPixels | null,
  current: ScreenPixels,
): ScreenPixels | null {
  const isSame =
    sent !== null &&
    sent.width === current.width &&
    sent.height === current.height &&
    sent.pixelRatio === current.pixelRatio;

  return isSame ? null : current;
}
