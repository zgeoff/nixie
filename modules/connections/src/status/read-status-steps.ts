import type { LogRecord, RecordKind } from '@heynixie/log';
import { z } from 'zod';
import { breakLastedCodec } from '../record/break-lasted-codec';
import { connectedCodec } from '../record/connected-codec';
import { statusReachedCodec } from '../record/status-reached-codec';
import type { ServiceContext } from '../service-context';
import type { StatusStep } from './collect-status-events';
import { readAllRecords } from './read-all-records';

const stepKinds = [
  'credential.status_changed',
  statusReachedCodec.kind,
  breakLastedCodec.kind,
  connectedCodec.kind,
] as const satisfies readonly RecordKind[];

// Every step of the status of the connections the IDs name, oldest first, from the whole log. A
// reconnect that renewed a connection steps it back to `active`, because it writes no status change
// of its own.
export async function readStatusSteps(
  context: ServiceContext,
  known: ReadonlySet<string>,
): Promise<StatusStep[]> {
  const records = await readAllRecords(context.log, stepKinds);

  return records.flatMap((record) => parseStep(record, known));
}

// The credential store's record of a status change, which names a connection by its ID.
const storedChangeSchema = z.object({
  credentialID: z.string(),
  status: z.enum(['active', 'failing', 'needs_consent', 'disconnected']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).optional(),
});

function parseStep(record: LogRecord, known: ReadonlySet<string>): StatusStep[] {
  const base = { sequence: record.sequence, atMs: record.recordedAt.getTime() };

  if (record.kind === statusReachedCodec.kind) {
    const reached = statusReachedCodec.decode(record.payload);

    return known.has(reached.connection)
      ? [{ ...base, connection: reached.connection, step: { kind: reached.status } }]
      : [];
  }

  if (record.kind === breakLastedCodec.kind) {
    const lasted = breakLastedCodec.decode(record.payload);

    return known.has(lasted.connection)
      ? [
          {
            ...base,
            connection: lasted.connection,
            step: { kind: 'lasted', sinceMs: lasted.sinceMs },
          },
        ]
      : [];
  }

  if (record.kind === connectedCodec.kind) {
    const connected = connectedCodec.decode(record.payload);

    return connected.again && known.has(connected.connection)
      ? [{ ...base, connection: connected.connection, step: { kind: 'active' } }]
      : [];
  }

  const stored = storedChangeSchema.safeParse(record.payload);

  if (!stored.success || !known.has(stored.data.credentialID)) {
    return [];
  }

  const change = stored.data;

  return [
    {
      ...base,
      connection: change.credentialID,
      step:
        change.status === 'failing'
          ? { kind: 'failing', reason: change.reason ?? null }
          : { kind: change.status },
    },
  ];
}
