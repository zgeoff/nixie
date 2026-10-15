import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { z } from 'zod';
import type { StartChanges } from './write-start-record';

// A start of nixie, with its version and the version of the start before it, or null for the
// first start, and what changed in what the conversation is given, or null when nothing compares.
export interface RestartEvent {
  readonly version: string;
  readonly previousVersion: string | null;
  readonly changes: StartChanges | null;
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
    render: (detail) => {
      const restart =
        detail.previousVersion === null
          ? `nixie restarted on version ${detail.version}.`
          : `nixie restarted on version ${detail.version} (was ${detail.previousVersion}).`;

      const changes = detail.changes === null ? [] : formatChanges(detail.changes);

      return changes.length === 0
        ? restart
        : `${restart}\n  Changed for you: ${changes.join('; ')}.`;
    },
  };
}

// the most starts one note reads, past which the block's count of more stops growing
const readLimit = 1000;

// a start recorded before the changes were has none
const changesPayload = z.object({
  addedTools: z.array(z.string()),
  removedTools: z.array(z.string()),
  isPersonaUpdated: z.boolean(),
});

const startPayload = z.object({
  version: z.string(),
  previousVersion: z.string().nullable(),
  changes: changesPayload.nullable().default(null),
});

// each change by name only, so the line stays short however much a release changed
function formatChanges(changes: StartChanges): readonly string[] {
  return [
    ...(changes.addedTools.length > 0 ? [`new tools: ${changes.addedTools.join(', ')}`] : []),
    ...(changes.removedTools.length > 0
      ? [`removed tools: ${changes.removedTools.join(', ')}`]
      : []),
    ...(changes.isPersonaUpdated ? ['persona updated'] : []),
  ];
}
