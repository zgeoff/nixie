import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { formatEventTime } from '@heynixie/sessions';
import { z } from 'zod';
import type { StartOutage } from '../utils/write-start-record';

const readLimit = 1000;

const startPayload = z.object({
  outage: z.object({ downAtMs: z.number(), upAtMs: z.number() }).optional(),
});

export function buildOutageKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<StartOutage> {
  return {
    name: 'outage',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: ['server.started'],
        limit: readLimit,
      });

      return records.flatMap((entry) => {
        const record = entry.record;
        const payload = startPayload.safeParse(record.payload);

        return payload.success && payload.data.outage !== undefined
          ? [
              {
                sequence: record.sequence,
                at: payload.data.outage.upAtMs,
                detail: payload.data.outage,
              },
            ]
          : [];
      });
    },
    render: (detail, settings) =>
      `nixie was down from ${formatEventTime(detail.downAtMs, settings.timeZone)} to ${formatEventTime(detail.upAtMs, settings.timeZone)}.`,
  };
}
