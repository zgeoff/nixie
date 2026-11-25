import { onTestFinished } from 'bun:test';
import { seedImage } from '@heynixie/connectors/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { readLayout } from '../layout/read-layout';
import type { OpenDeviceStream } from '../stream/create-device-streams';
import { createDeviceStreams, deviceOfflineGraceMs } from '../stream/create-device-streams';
import type { DevicePreviewOptions } from '../tool/device-tool-options';
import { buildTestFetching } from './build-test-fetching';
import { forgetTestRecord } from './forget-test-record';
import { makeDeviceToolCaller } from './make-device-tool-caller';
import { makeDeviceToolPreparer } from './make-device-tool-preparer';
import { removeTestRecordKey } from './remove-test-record-key';
import { restartTestLog } from './restart-test-log';
import { seedDevice } from './seed-device';
import type { DeviceSeed } from './seed-device';
import { seedDevicePackage } from './seed-device-package';
import { seedLayout } from './seed-layout';
import { seedScreenOnDevice } from './seed-screen-on-device';
import { startTestLog } from './start-test-log';

export interface StartTestDevicesOptions {
  // the render of the preview tool; absent leaves the tool with no render sandbox
  readonly preview?: DevicePreviewOptions;

  // set to give the page tools a fake fetch sandbox, with the hosts the rules allow; absent leaves
  // a page no packages and no fetches
  readonly fetching?: {
    readonly allowedHosts: readonly string[];
    readonly secrets?: readonly string[];
  };
}

// Starts a log with the device tools over it, so a test calls a tool and reads what the log and the
// streams hold after it.
export async function startTestDevices(options: StartTestDevicesOptions = {}) {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-21T08:00:00.000Z') });

  // registered before the log's own cleanup, so a runner that a test defers here stops while the
  // log still runs
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const log = await startTestLog(clock);

  const streams = createDeviceStreams({ clock });
  const deps = { log, clock };

  const site = buildTestFetching({
    clock,
    allowedHosts: options.fetching?.allowedHosts ?? [],
    secrets: options.fetching?.secrets ?? [],
  });

  const preview = {
    ...(options.preview === undefined ? {} : { preview: options.preview }),
    ...(options.fetching === undefined ? {} : { fetching: site.fetching }),
  };

  return {
    log,
    clock,

    // what a test defers here is disposed before the log stops
    stack,
    streams,
    definitions,

    // the fake registry and sites behind the page tools, and the record of what they were asked
    site,
    seed: {
      device: (input?: Partial<DeviceSeed>) => seedDevice(deps, input),
      screenOnDevice: (input?: Partial<DeviceSeed>) => seedScreenOnDevice(deps, input),
      layout: (deviceID: string) => seedLayout({ log, definitions, clock, streams }, deviceID),

      // an approved package, stored as an install leaves it, with the files by path
      package: (spec: string, files: Readonly<Record<string, string>>) =>
        seedDevicePackage({ log, definitions, clock, streams }, spec, files),
      image: (image: string) =>
        seedImage(log, { image, source: 'file', bytes: new Uint8Array([1, 2, 3]) }),
    },

    // closes the device's stream and lets the grace run out, so the device reads as offline
    closeStream: async (deviceID: string, stream: OpenDeviceStream) => {
      stream.close();
      clock.advance(deviceOfflineGraceMs);

      await waitForCondition(() => !streams.isOnline(deviceID));
    },
    removeKey: (sequence: number) => removeTestRecordKey(log, sequence),

    // a forget through the erasure runner
    forget: (sequence: number) => forgetTestRecord(log, sequence),
    readLayout: (deviceID: string) => readLayout(log, deviceID, clock.now()),

    // a server that just started over the same data directory: the old writer is stopped, and no
    // stream is open yet
    restart: async () => {
      const restarted = await restartTestLog(log, clock);

      return {
        log: restarted,
        readLayout: (deviceID: string) => readLayout(restarted, deviceID, clock.now()),
        call: makeDeviceToolCaller({
          log: restarted,
          definitions,
          clock,
          streams: createDeviceStreams({ clock }),
          ...preview,
        }),
      };
    },
    readDevice: (identityID: string) => readDeviceByIdentity(log.writer.db, identityID),
    call: makeDeviceToolCaller({ log, definitions, clock, streams, ...preview }),
    prepare: makeDeviceToolPreparer({ log, definitions, clock, streams, ...preview }),
  };
}

function definitions() {
  return { snapshotHash: 'sha256:test' };
}
