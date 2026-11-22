import { readImageEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { Device } from '../types';
import { collectScreenImages } from './collect-screen-images';
import { readScreenState } from './read-screen-state';

export interface DeviceImage {
  readonly mediaType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

interface DeviceImageRequest {
  readonly image: string;
  readonly nowMs: number;
}

// An image of what the device shows at this moment, or null for any other image. The image's ID is
// matched as the show names it, by short ID.
export async function readDeviceImage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  device: Device,
  request: DeviceImageRequest,
): Promise<DeviceImage | null> {
  const state = await readScreenState(log, device, request.nowMs);

  if (!collectScreenImages(state).includes(request.image)) {
    return null;
  }

  const entry = await readImageEntry(log, request.image);

  return entry.kind === 'ok' ? { mediaType: entry.row.media_type, bytes: entry.bytes } : null;
}
