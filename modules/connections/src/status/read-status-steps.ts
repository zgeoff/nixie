import type { LogRecord, RecordKind } from '@heynixie/log';
import { z } from 'zod';
import { expiringWindowMs } from '../connection/pick-connection-status';
import { breakLastedCodec } from '../record/break-lasted-codec';
import { connectedCodec } from '../record/connected-codec';
import { statusReachedCodec } from '../record/status-reached-codec';
import type { ServiceContext } from '../service-context';
import type { StatusStep } from './collect-status-events';
import { pickReachedAtMs } from './pick-reached-at-ms';
import { readAllRecords } from './read-all-records';

const stepKinds = [
  'credential.status_changed',
  statusReachedCodec.kind,
  breakLastedCodec.kind,
  connectedCodec.kind,
] as const satisfies readonly RecordKind[];

// Every status step of the connections the IDs name, oldest first. A step the clock took holds the
// time of the grant. A renewal, which writes no status change of its own, steps the connection to
// `active`, or to `expiring` when its new grant ends within the window.
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
  status: z.enum(['active', 'failing', 'needs_consent']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).optional(),
});

function parseStep(record: LogRecord, known: ReadonlySet<string>): StatusStep[] {
  const base = { sequence: record.sequence, atMs: record.recordedAt.getTime() };

  if (record.kind === statusReachedCodec.kind) {
    const reached = statusReachedCodec.decode(record.payload);

    return known.has(reached.connection)
      ? [
          {
            ...base,
            atMs: pickReachedAtMs(reached.status, reached.endsAtMs),
            connection: reached.connection,
            step: { kind: reached.status },
          },
        ]
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

    if (!connected.again || !known.has(connected.connection)) {
      return [];
    }

    return [
      {
        ...base,
        connection: connected.connection,
        step: pickRenewalStep({
          endsAtMs: connected.endsAtMs ?? null,
          endedAtMs: connected.endedAtMs ?? null,
          wasAttending: connected.wasAttending === true,
          atMs: base.atMs,
        }),
      },
    ];
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

interface RenewalFacts {
  // the end of the grant the renewal gave, and of the one it renewed, each null for no limit
  readonly endsAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly wasAttending: boolean;
  readonly atMs: number;
}

// The status a renewal leaves: `expiring` for a grant within its window, and `active` for any other.
// The token exchange refuses a grant whose lifetime is not positive, so no renewal has ended.
function pickRenewalStep(facts: RenewalFacts): StatusStep['step'] {
  const ended = facts.endedAtMs !== null && facts.endedAtMs <= facts.atMs ? facts.endedAtMs : null;
  const endsAtMs = facts.endsAtMs;

  if (endsAtMs !== null && endsAtMs - facts.atMs <= expiringWindowMs) {
    return { kind: 'expiring', renewed: true, ...(ended === null ? {} : { endedAtMs: ended }) };
  }

  return {
    kind: 'active',
    wasAttending: facts.wasAttending,
    ...(ended === null ? {} : { endedAtMs: ended }),
  };
}
