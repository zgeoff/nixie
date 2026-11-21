import { seedImage } from '@heynixie/connectors/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { createDeviceStreams } from '../stream/create-device-streams';
import { buildDeviceToolCaller } from './build-device-tool-caller';
import { removeTestRecordKey } from './remove-test-record-key';
import { seedDevice } from './seed-device';
import type { DeviceSeed } from './seed-device';
import { seedScreenOnDevice } from './seed-screen-on-device';
import { startTestLog } from './start-test-log';

// Starts a log with the device tools over it, so a test calls a tool and reads what the log and the
// streams hold after it.
export async function startTestDevices() {
  const clock = buildTestClock(Date.parse('2026-11-21T08:00:00.000Z'));

  const log = await startTestLog(clock);

  const streams = createDeviceStreams();
  const deps = { log, clock };

  return {
    log,
    clock,
    streams,
    definitions,
    seed: {
      device: (input?: Partial<DeviceSeed>) => seedDevice(deps, input),
      screenOnDevice: (input?: Partial<DeviceSeed>) => seedScreenOnDevice(deps, input),
      image: (image: string) =>
        seedImage(log, { image, source: 'file', bytes: new Uint8Array([1, 2, 3]) }),
    },
    removeKey: (sequence: number) => removeTestRecordKey(log, sequence),
    readDevice: (identityID: string) => readDeviceByIdentity(log.writer.db, identityID),
    call: buildDeviceToolCaller({ log, definitions, clock, streams }),
  };
}

function definitions() {
  return { snapshotHash: 'sha256:test' };
}
