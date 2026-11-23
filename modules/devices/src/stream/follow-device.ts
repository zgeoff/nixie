import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { startRecordWake, subscribeToCommits } from '@heynixie/log';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readLayout } from '../layout/read-layout';
import { toLayoutState } from '../layout/to-layout-state';
import { readScreenState } from '../screen/read-screen-state';
import type { LayoutState, ScreenPixels, ScreenState } from '../types';
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

// The events of one open stream: what the screen shows now, then each change. The layout comes in
// events of its own, so a show that covers it does not drop it. A state that did not change sends
// nothing, and a device with no layout gets no layout event.
export async function* followDevice(
  options: FollowDeviceOptions,
): AsyncGenerator<ScreenState | LayoutState, void, undefined> {
  const stream = options.streams.open(options.deviceID, options.pixels);

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToCommits(options.log.writer, onChange),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const sent = { screen: '', layout: JSON.stringify(toLayoutState(null)) };

  try {
    while (options.signal?.aborted !== true) {
      wake.reset();

      const device = await readDeviceByShortID(options.log.writer.db, options.deviceID);

      if (device === null) {
        return;
      }

      const nowMs = options.clock.now();

      const state = await readScreenState(options.log, device, nowMs);
      const layout = await readLayout(options.log, device.deviceID, nowMs);

      const screenKey = JSON.stringify(state);

      if (screenKey !== sent.screen) {
        sent.screen = screenKey;
        yield state;
      }

      const layoutState = toLayoutState(layout);
      const layoutKey = JSON.stringify(layoutState);

      if (layoutKey !== sent.layout) {
        sent.layout = layoutKey;
        yield layoutState;
      }

      await waitForChange(wake.wait(), pickWakeDelayMs(state, layout, nowMs));
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
