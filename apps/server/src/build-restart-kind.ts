import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/models';
import { z } from 'zod';

// A start of nixie, with its version and the version of the start before it, or null for the
// first start.
export interface RestartEvent {
  readonly version: string;
  readonly previousVersion: string | null;
}

// The event kind for a nixie restart, read from each start's record.
export function buildRestartKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<RestartEvent> {
  return {
    name: 'restart',
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

        return payload.success
          ? [{ sequence: record.sequence, at: record.recordedAt.getTime(), detail: payload.data }]
          : [];
      });
    },
    render: (detail) =>
      detail.previousVersion === null
        ? `nixie restarted on version ${detail.version}.`
        : `nixie restarted on version ${detail.version} (was ${detail.previousVersion}).`,
  };
}

// the most starts one note reads, past which the block's count of more stops growing
const readLimit = 1000;

const startPayload = z.object({ version: z.string(), previousVersion: z.string().nullable() });
