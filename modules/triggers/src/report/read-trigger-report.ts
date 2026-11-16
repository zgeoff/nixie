import { parseJSONObject } from '@heynixie/log';
import type { LogTables } from '@heynixie/log';
import type { skipReasons } from '@heynixie/tasks';
import { findLateBySeconds, parseTriggerFired, triggerSkippedCodec } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface TriggerReportEntry {
  readonly definitionID: string;

  // the version that fired, for a late entry; a skip holds none
  readonly definitionHash: string | null;
  readonly kind: 'late' | 'skipped';
  readonly scheduledFor: string;
  readonly firedAt: string | null;
  readonly lateBySeconds: number | null;
  readonly reason: (typeof skipReasons)[number] | null;
  readonly sequence: number;
}

interface TriggerReportQuery {
  // entries scheduled at or after this instant, epoch milliseconds
  readonly sinceMs: number;
  readonly definitionID?: string;
}

// One late entry per fire that was a catch-up, and one skipped entry per skip, newest first. A skip
// reports the newest slot that it covers.
export async function readTriggerReport(
  db: Kysely<unknown>,
  query: TriggerReportQuery,
): Promise<readonly TriggerReportEntry[]> {
  const definitionID = query.definitionID;

  // A slot is recorded at or after its time, so a record from before `sinceMs` holds no slot from it.
  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'kind', 'payload'])
    .where('kind', 'in', ['trigger.fired', 'trigger.skipped'])
    .where('recorded_at', '>=', query.sinceMs)
    .$if(definitionID !== undefined, (builder) =>
      builder.where(sql`json_extract(payload, '$.definitionID')`, '=', definitionID ?? ''),
    )
    .orderBy('sequence', 'desc')
    .execute();

  return rows.flatMap((row) => {
    const payload = parseJSONObject(row.payload);

    if (row.kind === 'trigger.fired') {
      return toLateEntries(row.sequence, payload, query.sinceMs);
    }

    return toSkippedEntries(row.sequence, payload, query.sinceMs);
  });
}

function toLateEntries(
  sequence: number,
  payload: ReturnType<typeof parseJSONObject>,
  sinceMs: number,
): TriggerReportEntry[] {
  const fire = parseTriggerFired(payload);

  if (fire === null || !fire.isCatchUp || Date.parse(fire.scheduledFor) < sinceMs) {
    return [];
  }

  return [
    {
      definitionID: fire.definitionID,
      definitionHash: fire.definitionHash,
      kind: 'late',
      scheduledFor: fire.scheduledFor,
      firedAt: fire.firedAt,
      lateBySeconds: findLateBySeconds(fire),
      reason: null,
      sequence,
    },
  ];
}

function toSkippedEntries(
  sequence: number,
  payload: ReturnType<typeof parseJSONObject>,
  sinceMs: number,
): TriggerReportEntry[] {
  const skip = triggerSkippedCodec.decode(payload);
  const scheduledFor = skip.scheduledFor.at(-1);

  if (scheduledFor === undefined || Date.parse(scheduledFor) < sinceMs) {
    return [];
  }

  return [
    {
      definitionID: skip.definitionID,
      definitionHash: null,
      kind: 'skipped',
      scheduledFor,
      firedAt: null,
      lateBySeconds: null,
      reason: skip.reason,
      sequence,
    },
  ];
}
