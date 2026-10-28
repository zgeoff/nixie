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
import type { WriteInTransaction } from './types';

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

type WrittenMoment = Extract<MomentWrite, { readonly status: 'written' }>;

// The check and the record commit in one write transaction, so two callers that read the same
// version never both change the moment.
export async function writeMomentChange(
  context: MomentContext,
  request: MomentChangeRequest,
  planChange: (state: MomentChangeState) => Promise<PlannedMomentRecord | MomentRefusal>,
  writeInTransaction?: WriteInTransaction,
): Promise<MomentWrite> {
  const written = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<WrittenMoment> => {
      await writeInTransaction?.(tx);

      const row = await readMomentRow(tx.$extendTables<MomentTables>(), request.target.momentID);

      if (row === null || row.state === 'destroying' || row.state === 'destroyed') {
        throw new MomentChangeRefusedError('not_found');
      }

      if (row.version !== request.target.version) {
        throw new MomentChangeRefusedError('stale');
      }

      const planned = await planChange({ row, nextVersion: row.version + 1, tx });

      if (typeof planned === 'string') {
        throw new MomentChangeRefusedError(planned);
      }

      const caller = request.caller;

      const [record] = await writeRecordsInTransaction(tx, context.log, [
        {
          kind: planned.kind,
          definitions: context.definitions(),
          ...(caller.kind === 'model' ? { thread: caller.thread } : {}),
          payload: planned.payload,
          ...(planned.erasable === undefined ? {} : { erasable: planned.erasable }),
        },
      ]);

      invariant(record, 'the log wrote no record for the moment change');

      return {
        status: 'written',
        momentID: row.moment_id,
        shortID: row.short_id,
        version: row.version + 1,
        sequence: record.sequence,
        ...(planned.reflectionID === undefined ? {} : { reflectionID: planned.reflectionID }),
      };
    },
  ).catch((error: unknown) => {
    if (error instanceof MomentChangeRefusedError) {
      return error;
    }

    throw error;
  });

  return written instanceof MomentChangeRefusedError
    ? { status: 'refused', reason: written.reason }
    : written;
}

// A refusal throws inside the transaction, so a client action written by the hook rolls back with it.
class MomentChangeRefusedError extends Error {
  override readonly name = 'MomentChangeRefusedError';

  readonly reason: MomentRefusal;

  constructor(reason: MomentRefusal) {
    super(`the moment change is refused as ${reason}`);

    this.reason = reason;
  }
}
