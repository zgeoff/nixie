import type { ScreenPixels } from './read-screen-pixels';

// The size to send after a resize, or null while the server already has it.
export function pickPixelsToSend(sent: ScreenPixels, current: ScreenPixels): ScreenPixels | null {
  return sent.width === current.width && sent.height === current.height ? null : current;
}
