import { writeRecords } from '@heynixie/log';
import { readConnectionRows } from '../connection/read-connection-rows';
import { breakLastedCodec } from '../record/break-lasted-codec';
import { statusReachedCodec } from '../record/status-reached-codec';
import type { ServiceContext } from '../service-context';
import { collectDueStatusRecords } from './collect-due-status-records';
import type { DueStatusRecord, WatchedConnection } from './collect-due-status-records';
import { pickRowAttention } from './pick-row-attention';
import { pickStatusSince } from './pick-status-since';
import { readStatusSteps } from './read-status-steps';

// Writes the records that only the clock can owe: a connection that reached `expiring` or the end of
// its grant, and a break that passed `noticeMs`. Each is written once, so a pass repeats safely.
// Returns how many records it wrote.
export async function runStatusWatch(context: ServiceContext, noticeMs: number): Promise<number> {
  const rows = await readConnectionRows(context.log);

  const nowMs = context.now();
  const live = rows.filter((row) => row.binding === 'enabled');

  const watched = live.map((row): WatchedConnection => {
    const status = pickRowAttention(row, nowMs);

    return {
      connection: row.connection_id,
      status,
      sinceMs: status === null ? row.status_since : pickStatusSince(row, status),
      endsAtMs: row.refresh_expires_at,
      isStored: row.status === status,
    };
  });

  const steps = await readStatusSteps(context, new Set(live.map((row) => row.connection_id)));

  const due = collectDueStatusRecords(watched, steps, { nowMs, noticeMs });

  await writeRecords(
    context.log,
    due.map((record) => buildRecordInput(context, record)),
  );

  return due.length;
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
