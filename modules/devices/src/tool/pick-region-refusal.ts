import type { ImageState } from '@heynixie/connectors';
import type { Device } from '../types';

// What is wrong with the packages or fetches that a page names.
export type PageFault = 'UNKNOWN_PACKAGE' | 'BAD_FETCH' | 'FETCHES_UNAVAILABLE';

export type RegionRefusal =
  | 'UNKNOWN_DEVICE'
  | 'SCREEN_OFF'
  | 'UNKNOWN_REGION'
  | PageFault
  | 'UNKNOWN_IMAGE'
  | 'IMAGE_FORGOTTEN'
  | 'OFFLINE';

interface RegionFacts {
  readonly device: Device | null;

  // whether the device has a layout with a region of this name
  readonly isRegionKnown: boolean;

  // the first fault of the packages and fetches that the content names, when it has one
  readonly pageFault: PageFault | null;

  // the state of the image the content names, when it names one
  readonly images: readonly ImageState[];
  readonly isOnline: boolean;
}

// The first refusal of a region call: the device, its screen, the region, the content, then whether
// the device is online. The content refusals are the ones a show returns, and the faults of a page.
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

  if (facts.pageFault !== null) {
    return facts.pageFault;
  }

  if (facts.images.includes('missing')) {
    return 'UNKNOWN_IMAGE';
  }

  if (facts.images.includes('forgotten')) {
    return 'IMAGE_FORGOTTEN';
  }

  return facts.isOnline ? null : 'OFFLINE';
}
