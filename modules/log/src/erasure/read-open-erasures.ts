import type { ExpressionBuilder } from 'kysely';
import { sql } from 'kysely';
import { parseJSONObject } from '../record/parse-json-object';
import type { Log, LogTables, RecordRow } from '../types';
import { erasureStartedCodec } from './erasure-started-codec';

export interface OpenErasure {
  readonly sequence: number;
  readonly startedAtMs: number;
  readonly started: ReturnType<typeof erasureStartedCodec.decode>;
}

// Every erasure that has erasure.started and no erasure.finished, children before parents and
// otherwise oldest first.
export async function readOpenErasures(log: Pick<Log, 'writer'>): Promise<readonly OpenErasure[]> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records as started')
    .select(['started.sequence', 'started.recorded_at', 'started.payload'])
    .where('started.kind', '=', 'erasure.started')
    .where((eb) => eb.not(eb.exists(buildFinishedQuery(eb))))
    .orderBy('started.sequence', 'asc')
    .execute();

  const open = rows.map((row): OpenErasure => ({
    sequence: row.sequence,
    startedAtMs: row.recorded_at,
    started: erasureStartedCodec.decode(parseJSONObject(row.payload)),
  }));

  const parents = new Map(open.map((erasure) => [erasure.started.erasureID, erasure]));

  const depthOf = (erasure: OpenErasure): number => {
    const parent =
      erasure.started.parentID === null ? undefined : parents.get(erasure.started.parentID);

    return parent === undefined ? 0 : 1 + depthOf(parent);
  };

  return open.toSorted(
    (left, right) => depthOf(right) - depthOf(left) || left.sequence - right.sequence,
  );
}

function buildFinishedQuery(eb: ExpressionBuilder<LogTables & { started: RecordRow }, 'started'>) {
  return eb
    .selectFrom('records as finished')
    .select('finished.sequence')
    .where('finished.kind', '=', 'erasure.finished')
    .where(
      sql`json_extract(finished.payload, '$.erasureID')`,
      '=',
      sql`json_extract(started.payload, '$.erasureID')`,
    );
}
