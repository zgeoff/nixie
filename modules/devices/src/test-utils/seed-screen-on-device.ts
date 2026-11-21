import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { writeScreenSwitch } from '../device/write-screen-switch';
import type { DeviceSeed, DeviceSeedDeps, SeededDevice } from './seed-device';
import { seedDevice } from './seed-device';

// An enrolled device whose screen the device switched on.
export async function seedScreenOnDevice(
  deps: DeviceSeedDeps,
  input: Partial<DeviceSeed> = {},
): Promise<SeededDevice> {
  const seeded = await seedDevice(deps, input);
  const device = await readDeviceByIdentity(deps.log.writer.db, seeded.identityID);

  invariant(device, 'the seeded device has its row');

  await withWriteTransaction(deps.log.writer, (tx) =>
    writeScreenSwitch(tx, deps.log, {
      device,
      isOn: true,
      nowMs: deps.clock.now(),
      definitions: { snapshotHash: 'sha256:test' },
    }),
  );

  return seeded;
}
