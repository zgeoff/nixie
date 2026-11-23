import type { DeviceToolOptions } from '../tool/device-tool-options';
import { makeDeviceToolCaller } from './make-device-tool-caller';

// A layout of 3 blank regions in a row, `pond`, `note` and `clock`, set the way the assistant sets
// one. The device needs its screen on and an open stream.
export async function seedLayout(options: DeviceToolOptions, deviceID: string): Promise<void> {
  const outcome = await makeDeviceToolCaller(options)('device.layout', {
    device: deviceID,
    columns: ['1fr', '2fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 2, row: 1 },
      { name: 'clock', column: 3, row: 1 },
    ],
  });

  if (outcome.status !== 'ok' || 'refused' in outcome.result) {
    throw new Error('the seeded layout was refused');
  }
}
