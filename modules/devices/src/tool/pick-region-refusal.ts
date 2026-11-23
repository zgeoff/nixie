import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';

export type RegionRefusal =
  | 'UNKNOWN_DEVICE'
  | 'SCREEN_OFF'
  | 'UNKNOWN_REGION'
  | 'PAGE_NOT_BUILT'
  | 'UNKNOWN_IMAGE'
  | 'IMAGE_FORGOTTEN'
  | 'OFFLINE';

interface RegionFacts {
  readonly device: Device | null;

  // whether the device has a layout with a region of this name
  readonly isRegionKnown: boolean;
  readonly isPage: boolean;

  // the state of the image the content names, when it names one
  readonly images: readonly ImageState[];
  readonly isOnline: boolean;
}

// The first refusal of a region call: the device, its screen, the region, the content, then whether
// the device is online. The content refusals are the ones a show returns, and a page.
export function pickRegionRefusal(facts: RegionFacts): RegionRefusal | null {
  if (facts.device === null) {
    return 'UNKNOWN_DEVICE';
  }

  if (!facts.device.capabilities.screen) {
    return 'SCREEN_OFF';
  }

  if (!facts.isRegionKnown) {
    return 'UNKNOWN_REGION';
  }

  if (facts.isPage) {
    return 'PAGE_NOT_BUILT';
  }

  if (facts.images.includes('missing')) {
    return 'UNKNOWN_IMAGE';
  }

  if (facts.images.includes('forgotten')) {
    return 'IMAGE_FORGOTTEN';
  }

  return facts.isOnline ? null : 'OFFLINE';
}
