import { sql } from 'kysely';
import { parseJSONObject } from '../record/parse-json-object';
import type { Log, LogTables } from '../types';
import type { ErasableKind } from './erasable-kind';
import { erasureFinishedCodec } from './erasure-finished-codec';
import { erasureStartedCodec } from './erasure-started-codec';

export interface TargetErasure {
  readonly erasureID: string;
  readonly startedAtMs: number;
  readonly isFinished: boolean;
}

interface ErasureTargetQuery {
  readonly kind: ErasableKind;
  readonly targetID: string;
}

// Every erasure of the target, begun or finished, oldest first.
export async function readErasures(
  log: Pick<Log, 'writer'>,
  target: ErasureTargetQuery,
): Promise<readonly TargetErasure[]> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['recorded_at', 'payload'])
    .where('kind', '=', sql.lit('erasure.started'))
    .where(sql`json_extract(payload, '$.targetID')`, '=', target.targetID)
    .where(sql`json_extract(payload, '$.kind')`, '=', target.kind)
    .orderBy('sequence')
    .execute();

  const finished = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', sql.lit('erasure.finished'))
    .where(sql`json_extract(payload, '$.targetID')`, '=', target.targetID)
    .where(sql`json_extract(payload, '$.kind')`, '=', target.kind)
    .execute();

  const finishedIDs = new Set(
    finished.map((row) => erasureFinishedCodec.decode(parseJSONObject(row.payload)).erasureID),
  );

  return rows.map((row) => {
    const erasureID = erasureStartedCodec.decode(parseJSONObject(row.payload)).erasureID;

    return { erasureID, startedAtMs: row.recorded_at, isFinished: finishedIDs.has(erasureID) };
  });
}
