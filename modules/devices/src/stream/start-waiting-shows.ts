import type { Clock } from '@heynixie/clock';
import { screenContentSchema } from '@heynixie/contract';
import type { Definitions, Log } from '@heynixie/log';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { deviceShownCodec } from '../record/device-shown-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import { writeShow } from '../tool/write-show';
import type { DeviceStatusChange, DeviceStreams } from './create-device-streams';

export interface WaitingShowsOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: DeviceStreams;
  readonly onFailure: (error: unknown) => void;
}

// Starts the minutes of a show that waited for its device, when the device comes online. It writes
// the show again with an end that lies its minutes after that time, and returns the function that
// stops it.
export function startWaitingShows(options: WaitingShowsOptions): () => void {
  return options.streams.subscribeToStatus((change) => {
    if (change.status === 'online') {
      void handleDeviceOnline(options, change);
    }
  });
}

async function handleDeviceOnline(
  options: WaitingShowsOptions,
  change: DeviceStatusChange,
): Promise<void> {
  try {
    await writeShowClock(options, change.deviceID);
  } catch (error) {
    options.onFailure(error);
  }
}

async function writeShowClock(options: WaitingShowsOptions, deviceID: string): Promise<void> {
  const device = await readDeviceByShortID(options.log.writer.db, deviceID);

  if (device === null || device.shownSequence === null) {
    return;
  }

  const record = await readScreenRecord(options.log, device.shownSequence);

  if (record === null || record.fields === null || record.thread === null) {
    return;
  }

  const shown = deviceShownCodec.decode(record.payload);
  const content = screenContentSchema.safeParse(record.fields['content']);

  if (shown.until !== null || shown.lastsMs === undefined || shown.lastsMs === null) {
    return;
  }

  if (!content.success) {
    return;
  }

  await writeShow(options, {
    deviceID,
    thread: record.thread,
    content: content.data,
    untilMs: options.clock.now() + shown.lastsMs,
    ifShownSequence: device.shownSequence,
  });
}
