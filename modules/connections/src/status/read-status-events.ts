import { readRecords } from '@heynixie/log';
import type { LogRecord, RecordKind } from '@heynixie/log';
import { z } from 'zod';
import { openConnectionValues } from '../connection/open-connection-values';
import { readConnectionRows } from '../connection/read-connection-rows';
import { breakLastedCodec } from '../record/break-lasted-codec';
import { callFailedCodec } from '../record/call-failed-codec';
import { statusReachedCodec } from '../record/status-reached-codec';
import type { ServiceContext } from '../service-context';
import { collectStatusEvents } from './collect-status-events';
import type { FailedCall, StatusStep } from './collect-status-events';
import type { ConnectionIdentity, StatusEvent, StatusEventRange } from './types';

const stepKinds = [
  'credential.status_changed',
  statusReachedCodec.kind,
  breakLastedCodec.kind,
] as const satisfies readonly RecordKind[];

// The status events of the log range, each with the label and account of its connection read now. A
// forgotten connection has no event, and no record holds a label or an account.
export async function readStatusEvents(
  context: ServiceContext,
  range: StatusEventRange,
): Promise<StatusEvent[]> {
  const identities = await readIdentities(context);
  const records = await readAllRecords(context, stepKinds, range.through);

  const steps = records.flatMap((record) => parseStep(record, identities));

  const hasReturn = steps.some(
    (step) =>
      step.step.kind === 'active' && step.sequence > range.after && step.sequence <= range.through,
  );

  const failures = hasReturn ? await readFailedCalls(context) : [];

  return collectStatusEvents({ steps, failedCalls: failures, identities }, range);
}

async function readIdentities(
  context: ServiceContext,
): Promise<ReadonlyMap<string, ConnectionIdentity>> {
  const rows = await readConnectionRows(context.log);

  const enabled = rows.filter((row) => row.binding === 'enabled');

  const opened = await openConnectionValues(context.log, enabled);

  return new Map(
    enabled.flatMap((row): [string, ConnectionIdentity][] => {
      const values = opened.get(row.connection_id);
      const label = values?.label ?? null;
      const account = values?.account?.email ?? null;

      return label === null || account === null
        ? []
        : [
            [
              row.connection_id,
              { connection: row.short_id, connector: row.connector_id, label, account },
            ],
          ];
    }),
  );
}

const pageSize = 1000;

async function readAllRecords(
  context: ServiceContext,
  kinds: readonly RecordKind[],
  through: number,
): Promise<LogRecord[]> {
  const found: LogRecord[] = [];
  let after = 0;

  for (;;) {
    const page = await readRecords(context.log, {
      afterSequence: after,
      beforeSequence: through + 1,
      kinds,
      limit: pageSize,
    });

    found.push(...page.map((entry) => entry.record));

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return found;
    }

    after = last.record.sequence;
  }
}

// The credential store's record of a status change, which names a connection by its ID.
const storedChangeSchema = z.object({
  credentialID: z.string(),
  status: z.enum(['active', 'failing', 'needs_consent']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).optional(),
});

function parseStep(
  record: LogRecord,
  identities: ReadonlyMap<string, ConnectionIdentity>,
): StatusStep[] {
  const base = { sequence: record.sequence, atMs: record.recordedAt.getTime() };

  if (record.kind === statusReachedCodec.kind) {
    const reached = statusReachedCodec.decode(record.payload);

    return [{ ...base, connection: reached.connection, step: { kind: reached.status } }];
  }

  if (record.kind === breakLastedCodec.kind) {
    const lasted = breakLastedCodec.decode(record.payload);

    return [
      {
        ...base,
        connection: lasted.connection,
        step: { kind: 'lasted', sinceMs: lasted.sinceMs },
      },
    ];
  }

  const stored = storedChangeSchema.safeParse(record.payload);

  if (!stored.success || !identities.has(stored.data.credentialID)) {
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

// A call that began in a break notes its failure after the answer that ended the break, so the read
// runs past the range.
async function readFailedCalls(context: ServiceContext): Promise<FailedCall[]> {
  const records = await readAllRecords(
    context,
    [callFailedCodec.kind],
    Number.MAX_SAFE_INTEGER - 1,
  );

  return records.map((record) => ({
    sequence: record.sequence,
    connection: callFailedCodec.decode(record.payload).connection,
  }));
}
