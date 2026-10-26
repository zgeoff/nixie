import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type {
  MomentCaller,
  MomentContext,
  MomentRefusal,
  MomentTables,
  MomentTarget,
  MomentWrite,
} from './moment-types';
import type { MomentRow } from './read-moment-row';
import { readMomentRow } from './read-moment-row';

export interface PlannedMomentRecord {
  readonly kind: 'moment_edited' | 'moment_linked' | 'moment_retired';
  readonly payload: JSONObject;
  readonly erasable?: JSONObject;
  readonly reflectionID?: string;
}

export interface MomentChangeState {
  readonly row: MomentRow;
  readonly nextVersion: number;
  readonly tx: Transaction<unknown>;
}

export interface MomentChangeRequest {
  readonly caller: MomentCaller;
  readonly target: MomentTarget;
}

// The check and the record commit in one write transaction, so two callers that read the same
// version never both change the moment.
export function writeMomentChange(
  context: MomentContext,
  request: MomentChangeRequest,
  planChange: (state: MomentChangeState) => Promise<PlannedMomentRecord | MomentRefusal>,
): Promise<MomentWrite> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<MomentWrite> => {
    const row = await readMomentRow(tx.$extendTables<MomentTables>(), request.target.momentID);

    if (row === null || row.state === 'destroying' || row.state === 'destroyed') {
      return { status: 'refused', reason: 'not_found' };
    }

    if (row.version !== request.target.version) {
      return { status: 'refused', reason: 'stale' };
    }

    const planned = await planChange({ row, nextVersion: row.version + 1, tx });

    if (typeof planned === 'string') {
      return { status: 'refused', reason: planned };
    }

    const caller = request.caller;

    const [written] = await writeRecordsInTransaction(tx, context.log, [
      {
        kind: planned.kind,
        definitions: context.definitions(),
        ...(caller.kind === 'model' ? { thread: caller.thread } : {}),
        payload: planned.payload,
        ...(planned.erasable === undefined ? {} : { erasable: planned.erasable }),
      },
    ]);

    invariant(written, 'the log wrote no record for the moment change');

    return {
      status: 'written',
      momentID: row.moment_id,
      shortID: row.short_id,
      version: row.version + 1,
      sequence: written.sequence,
      ...(planned.reflectionID === undefined ? {} : { reflectionID: planned.reflectionID }),
    };
  });
}
