import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import { startRecordWake, subscribeToCommits } from '@heynixie/log';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { collectShownIDs } from '../layout/collect-shown-ids';
import { readLayout } from '../layout/read-layout';
import { toLayoutState } from '../layout/to-layout-state';
import { readScreenState } from '../screen/read-screen-state';
import type {
  LayoutState,
  LayoutView,
  PageMessageState,
  ScreenPixels,
  ScreenState,
} from '../types';
import type { DeviceStreams } from './create-device-streams';
import type { IssuedTickets } from './create-page-tickets';
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
// nothing. A message into a page follows the state it was sent against.
export async function* followDevice(
  options: FollowDeviceOptions,
): AsyncGenerator<ScreenState | LayoutState | PageMessageState, void, undefined> {
  const stream = options.streams.open(options.deviceID, options.pixels);

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToCommits(options.log.writer, onChange),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const sent = { screen: '', layout: JSON.stringify(toLayoutState(null)), isFirst: true };

  try {
    while (options.signal?.aborted !== true) {
      // read before the state, so a message sent after a commit never reaches the device ahead of
      // the layout that holds its content
      const queued = stream.readMessages();

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

      const layoutState = toLayoutState(
        layout,
        issueTickets(options.streams, device.deviceID, layout),
      );

      const layoutKey = JSON.stringify(layoutState);

      if (layoutKey !== sent.layout) {
        sent.layout = layoutKey;
        yield layoutState;
      }

      const messages = sent.isFirst
        ? options.streams.messages.readRetained(device.deviceID, collectShownIDs(layout))
        : queued;

      sent.isFirst = false;

      for (const message of messages) {
        yield { kind: 'message', ...message };
      }

      await waitForChange(
        wake.wait(),
        options.clock,
        pickWakeDelayMs(state, layout, nowMs),
        stream.waitForMessage,
      );
    }
  } finally {
    wake.stop();
    stream.close();
  }
}

// The tickets of each page region's current content, which stay the same while the content does.
function issueTickets(
  streams: DeviceStreams,
  deviceID: string,
  layout: LayoutView | null,
): ReadonlyMap<string, IssuedTickets> {
  return new Map(
    (layout?.regions ?? []).flatMap((region) =>
      region.shown?.content.kind === 'html'
        ? [
            [
              region.name,
              streams.tickets.issue(
                deviceID,
                region.name,
                region.shown.shownID,
                region.shown.content.images ?? [],
              ),
            ] as const,
          ]
        : [],
    ),
  );
}

// Waits for a commit, or for the delay on the stream's own clock, so a clock that a test or a
// verify run moves forward wakes the stream as a real minute would.
async function waitForChange(
  woken: Promise<void>,
  clock: Clock,
  delayMs: number | null,
  waitForMessage: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const waiting = new AbortController();

  await Promise.race([
    woken,
    waitForMessage(waiting.signal),
    ...(delayMs === null ? [] : [clock.sleep(delayMs, waiting.signal)]),
  ]);

  waiting.abort();
}
