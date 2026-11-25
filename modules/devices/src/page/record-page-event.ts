import type { Clock } from '@heynixie/clock';
import type { PageData } from '@heynixie/contract';
import type { Definitions, Log, RecordInput, WriteTransaction } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { readLayout } from '../layout/read-layout';
import { devicePageEventCodec } from '../record/device-page-event-codec';
import type { DeviceStreams } from '../stream/create-device-streams';
import type { Device } from '../types';
import { probeWakeRoom } from './probe-wake-room';

export interface PageEventSink {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: Pick<DeviceStreams, 'eventLimits'>;

  // the thread of the conversation, which every page event goes to
  readonly thread: string;

  // writes the record as the conversation's inbox takes it, which wakes the model when the record
  // asks for it
  readonly writeEvent: (tx: WriteTransaction, input: RecordInput) => Promise<void>;

  // called with the reason, once for each event that a limit dropped
  readonly onDrop: (reason: 'region_rate' | 'unknown_region', region: string) => void;
}

export interface PageEventReport {
  readonly region: string;
  readonly shown: string;
  readonly name: string;
  readonly data?: PageData;
  readonly wake: boolean;
}

// Keeps an event that a page sent. The event is stale when the screen is off or the region shows
// no page or other content, and dropped when the region sent too many; neither keeps anything.
// A wake past the device's hourly limit is written with no wake.
export async function recordPageEvent(
  sink: PageEventSink,
  device: Device,
  report: PageEventReport,
): Promise<'recorded' | 'stale' | 'dropped'> {
  const nowMs = sink.clock.now();

  if (!device.capabilities.screen) {
    return 'stale';
  }

  const layout = await readLayout(sink.log, device.deviceID, nowMs);

  const region = layout?.regions.find((candidate) => candidate.name === report.region);

  if (region?.shown?.shownID !== report.shown || region.shown.content.kind !== 'html') {
    return 'stale';
  }

  if (!sink.streams.eventLimits.admit(device.deviceID, report.region, nowMs)) {
    sink.onDrop('region_rate', report.region);

    return 'dropped';
  }

  const hasRoom = report.wake ? await probeWakeRoom(sink.log, device.deviceID, nowMs) : false;
  const wake = report.wake && hasRoom;

  await withWriteTransaction(sink.log.writer, (tx) =>
    sink.writeEvent(tx, {
      kind: devicePageEventCodec.kind,
      definitions: sink.definitions(),
      thread: sink.thread,
      contentSource: 'untrusted',
      payload: devicePageEventCodec.encode({
        device: device.deviceID,
        deviceName: device.name,
        region: report.region,
        shown: report.shown,
        name: report.name,
        wake,
      }),
      erasable: { data: report.data ?? null },
    }),
  );

  return 'recorded';
}
