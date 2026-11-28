import { readRecords, writeRecords } from '@heynixie/log';
import { pickConnectionStatus } from '../connection/pick-connection-status';
import { readConnectionRows } from '../connection/read-connection-rows';
import { breakLastedCodec } from '../record/break-lasted-codec';
import { statusReachedCodec } from '../record/status-reached-codec';
import type { ServiceContext } from '../service-context';
import { collectDueStatusRecords } from './collect-due-status-records';
import type { DueStatusRecord, WatchedConnection } from './collect-due-status-records';
import { pickAttentionStatus } from './pick-attention-status';
import { pickStatusSince } from './pick-status-since';

// Writes the records that only the clock can owe: a connection that reached `expiring` or the end of
// its grant, and a break that passed `noticeMs`. Each is written once, so a pass repeats safely.
// Returns how many records it wrote.
export async function runStatusWatch(context: ServiceContext, noticeMs: number): Promise<number> {
  const rows = await readConnectionRows(context.log);

  const nowMs = context.now();

  const watched = rows
    .filter((row) => row.binding === 'enabled')
    .map((row): WatchedConnection => {
      const status = pickAttentionStatus(
        pickConnectionStatus({
          binding: row.binding,
          status: row.status,
          refreshExpiresAtMs: row.refresh_expires_at,
          nowMs,
        }),
      );

      return {
        connection: row.connection_id,
        status,
        sinceMs: status === null ? row.status_since : pickStatusSince(row, status),
        endsAtMs: row.refresh_expires_at,
        isStored: row.status === 'needs_consent' || row.status === 'failing',
      };
    });

  const written = await readWrittenKeys(context);

  const due = collectDueStatusRecords(watched, written, { nowMs, noticeMs });

  await writeRecords(
    context.log,
    due.map((record) => buildRecordInput(context, record)),
  );

  return due.length;
}

const pageSize = 1000;

async function readWrittenKeys(context: ServiceContext) {
  const records = await readRecords(context.log, {
    afterSequence: 0,
    kinds: [statusReachedCodec.kind, breakLastedCodec.kind],
    limit: pageSize,
    order: 'newest',
  });

  return {
    reached: records.flatMap((entry) =>
      entry.record.kind === statusReachedCodec.kind
        ? [statusReachedCodec.decode(entry.record.payload)]
        : [],
    ),
    lasted: records.flatMap((entry) =>
      entry.record.kind === breakLastedCodec.kind
        ? [breakLastedCodec.decode(entry.record.payload)]
        : [],
    ),
  };
}

function buildRecordInput(context: ServiceContext, due: DueStatusRecord) {
  return due.kind === 'reached'
    ? {
        kind: statusReachedCodec.kind,
        definitions: context.definitions(),
        payload: statusReachedCodec.encode(due.key),
      }
    : {
        kind: breakLastedCodec.kind,
        definitions: context.definitions(),
        payload: breakLastedCodec.encode(due.key),
      };
}
