import { readImageEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import { collectLayoutImages } from '../layout/collect-layout-images';
import { readLayout } from '../layout/read-layout';
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

// An image of what the device shows at this moment, in its show, its idle scene or any region of its
// layout, or null for any other image. The image's ID is matched as the content names it, by short
// ID.
export async function readDeviceImage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  device: Device,
  request: DeviceImageRequest,
): Promise<DeviceImage | null> {
  const [state, layout] = await Promise.all([
    readScreenState(log, device, request.nowMs),
    readLayout(log, device.deviceID, request.nowMs),
  ]);

  const shown = [...collectScreenImages(state), ...collectLayoutImages(layout)];

  if (!shown.includes(request.image)) {
    return null;
  }

  const entry = await readImageEntry(log, request.image);

  return entry.kind === 'ok' ? { mediaType: entry.row.media_type, bytes: entry.bytes } : null;
}
