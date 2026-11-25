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
// A wake past the hourly limit is written with no wake. Every check runs in the write's transaction.
export async function recordPageEvent(
  sink: PageEventSink,
  device: Device,
  report: PageEventReport,
): Promise<'recorded' | 'stale' | 'dropped'> {
  if (!device.capabilities.screen) {
    return 'stale';
  }

  const outcome = await withWriteTransaction(sink.log.writer, async (tx) => {
    const inTransaction = { ...sink.log, writer: { ...sink.log.writer, db: tx } };
    const nowMs = sink.clock.now();

    const layout = await readLayout(inTransaction, device.deviceID, nowMs);

    const region = layout?.regions.find((candidate) => candidate.name === report.region);

    if (region?.shown?.shownID !== report.shown || region.shown.content.kind !== 'html') {
      return 'stale';
    }

    if (!sink.streams.eventLimits.admit(device.deviceID, report.region, nowMs)) {
      return 'dropped';
    }

    const hasRoom = report.wake
      ? await probeWakeRoom(inTransaction, device.deviceID, nowMs)
      : false;

    await sink.writeEvent(tx, {
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
        wake: report.wake && hasRoom,
      }),
      erasable: { data: report.data ?? null },
    });

    return 'recorded';
  });

  if (outcome === 'dropped') {
    sink.onDrop('region_rate', report.region);
  }

  return outcome;
}
