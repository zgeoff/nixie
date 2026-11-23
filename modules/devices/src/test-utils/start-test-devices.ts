import { seedImage } from '@heynixie/connectors/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { readLayout } from '../layout/read-layout';
import { createDeviceStreams } from '../stream/create-device-streams';
import { buildDeviceToolCaller } from './build-device-tool-caller';
import { makeDeviceToolPreparer } from './make-device-tool-preparer';
import { removeTestRecordKey } from './remove-test-record-key';
import { restartTestLog } from './restart-test-log';
import { seedDevice } from './seed-device';
import type { DeviceSeed } from './seed-device';
import { seedLayout } from './seed-layout';
import { seedScreenOnDevice } from './seed-screen-on-device';
import { startTestLog } from './start-test-log';

// Starts a log with the device tools over it, so a test calls a tool and reads what the log and the
// streams hold after it.
export async function startTestDevices() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-21T08:00:00.000Z') });

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
      layout: (deviceID: string) => seedLayout({ log, definitions, clock, streams }, deviceID),
      image: (image: string) =>
        seedImage(log, { image, source: 'file', bytes: new Uint8Array([1, 2, 3]) }),
    },
    removeKey: (sequence: number) => removeTestRecordKey(log, sequence),
    readLayout: (deviceID: string) => readLayout(log, deviceID, clock.now()),

    // a server that just started over the same data directory: the old writer is stopped, and no
    // stream is open yet
    restart: async () => {
      const restarted = await restartTestLog(log, clock);

      return {
        log: restarted,
        readLayout: (deviceID: string) => readLayout(restarted, deviceID, clock.now()),
        call: buildDeviceToolCaller({
          log: restarted,
          definitions,
          clock,
          streams: createDeviceStreams(),
        }),
      };
    },
    readDevice: (identityID: string) => readDeviceByIdentity(log.writer.db, identityID),
    call: buildDeviceToolCaller({ log, definitions, clock, streams }),
    prepare: makeDeviceToolPreparer({ log, definitions, clock, streams }),
  };
}

function definitions() {
  return { snapshotHash: 'sha256:test' };
}
