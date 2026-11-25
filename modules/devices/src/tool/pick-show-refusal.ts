import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';

export type ShowRefusal = 'UNKNOWN_DEVICE' | 'SCREEN_OFF' | 'UNKNOWN_IMAGE' | 'IMAGE_FORGOTTEN';

interface ShowFacts {
  readonly device: Device | null;

  // the state of each image the show names
  readonly images: readonly ImageState[];
}

// The first refusal of a show, in the order the design fixes: the device, its screen, then the
// images. A device that is offline refuses nothing, because a show waits for it.
export function pickShowRefusal(facts: ShowFacts): ShowRefusal | null {
  if (facts.device === null) {
    return 'UNKNOWN_DEVICE';
  }

  if (!facts.device.capabilities.screen) {
    return 'SCREEN_OFF';
  }

  if (facts.images.includes('missing')) {
    return 'UNKNOWN_IMAGE';
  }

  if (facts.images.includes('forgotten')) {
    return 'IMAGE_FORGOTTEN';
  }

  return null;
}
