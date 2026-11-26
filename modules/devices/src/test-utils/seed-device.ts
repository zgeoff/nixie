import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { writeDevice } from '../device/write-device';
import type { DeviceKind } from '../types';

export interface DeviceSeedDeps {
  readonly log: Log;
  readonly clock: Clock;
}

export interface DeviceSeed {
  readonly name: string;
  readonly deviceKind: DeviceKind;
}

export interface SeededDevice {
  readonly deviceID: string;
  readonly identityID: string;
}

// An enrolled device as enrolment leaves it: a screen device with every capability off unless the
// seed says client.
export async function seedDevice(
  deps: DeviceSeedDeps,
  input: Partial<DeviceSeed> = {},
): Promise<SeededDevice> {
  const identityID = crypto.randomUUID();

  const deviceID = await withWriteTransaction(deps.log.writer, (tx) =>
    writeDevice(tx, {
      identityID,
      name: input.name ?? 'desk panel',
      nowMs: deps.clock.now(),
      deviceKind: input.deviceKind ?? 'screen',
    }),
  );

  return { deviceID, identityID };
}
