import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { startRecordWake, subscribeToCommits } from '@heynixie/log';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readScreenState } from '../screen/read-screen-state';
import type { ScreenPixels, ScreenState } from '../types';
import type { DeviceStreams } from './create-device-streams';
import { pickWakeDelayMs } from './pick-wake-delay-ms';

export interface FollowDeviceOptions {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly clock: Clock;
  readonly streams: DeviceStreams;
  readonly deviceID: string;
  readonly pixels: ScreenPixels;
  readonly signal?: AbortSignal | undefined;
}

// The events of one open stream: what the screen shows now, then each change. Every commit makes
// the stream read the screen again, and a state that did not change sends nothing.
export async function* followDevice(
  options: FollowDeviceOptions,
): AsyncGenerator<ScreenState, void, undefined> {
  const stream = options.streams.open(options.deviceID, options.pixels);

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToCommits(options.log.writer, onChange),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const sent = { last: '' };

  try {
    while (options.signal?.aborted !== true) {
      wake.reset();

      const device = await readDeviceByShortID(options.log.writer.db, options.deviceID);

      if (device === null) {
        return;
      }

      const nowMs = options.clock.now();

      const state = await readScreenState(options.log, device, nowMs);

      const key = JSON.stringify(state);

      if (key !== sent.last) {
        sent.last = key;
        yield state;
      }

      await waitForChange(wake.wait(), pickWakeDelayMs(state, nowMs));
    }
  } finally {
    wake.stop();
    stream.close();
  }
}

async function waitForChange(woken: Promise<void>, delayMs: number | null): Promise<void> {
  if (delayMs === null) {
    await woken;

    return;
  }

  const timer: { id: ReturnType<typeof setTimeout> | null } = { id: null };

  await Promise.race([
    woken,
    new Promise<void>((resolve) => {
      timer.id = setTimeout(resolve, delayMs);
    }),
  ]);

  if (timer.id !== null) {
    clearTimeout(timer.id);
  }
}
