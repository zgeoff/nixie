import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { writeDevice } from '../device/write-device';

export interface DeviceSeedDeps {
  readonly log: Log;
  readonly clock: Clock;
}

export interface DeviceSeed {
  readonly name: string;
}

export interface SeededDevice {
  readonly deviceID: string;
  readonly identityID: string;
}

// An enrolled device as enrolment leaves it, with every capability off.
export async function seedDevice(
  deps: DeviceSeedDeps,
  input: Partial<DeviceSeed> = {},
): Promise<SeededDevice> {
  const identityID = crypto.randomUUID();

  const deviceID = await withWriteTransaction(deps.log.writer, (tx) =>
    writeDevice(tx, { identityID, name: input.name ?? 'desk panel', nowMs: deps.clock.now() }),
  );

  return { deviceID, identityID };
}
