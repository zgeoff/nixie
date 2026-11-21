import { imageLimits } from '@heynixie/contract';
import type { ImageRoom } from '@heynixie/tools';

// the base64 form of the largest image the model is sent, which the session's caps count
const largestImageBytes = Math.ceil(imageLimits.bytes / 3) * 4;

// How many more images at the largest size the session's caps take.
export function pickRoomLeft(room: ImageRoom | undefined): number {
  if (room === undefined) {
    return 0;
  }

  return Math.max(0, Math.min(room.count, Math.floor(room.bytes / largestImageBytes)));
}
