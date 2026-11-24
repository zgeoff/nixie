import type { Erasable, ErasureStart, Log, LogTables, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { readForgetFloor } from '../../forget/read-forget-floor';
import type { MomentContext, MomentTables, MomentTarget } from '../../utils/moment-context';
import { readMomentRow } from '../read-moment-row';
import type { MomentIndexes } from '../store/start-store-indexes';
import { updateMomentIndex } from '../update-moment-index';
import { readLegacyOpenMomentDestroys } from './read-legacy-open-moment-destroys';

export interface MomentErasureRequest extends MomentTarget {
  // starts from a moment that an earlier release's destroy left in destroying
  readonly isResuming?: boolean | undefined;
}

// The moment's runner methods. A forget captures the key of every text of the moment, takes the
// moment out of the search index, and has no child.
export function buildMomentErasable(
  context: Pick<MomentContext, 'log'>,
  indexes: MomentIndexes,
): Erasable<MomentErasureRequest> {
  const hide = () => updateMomentIndex(context.log, indexes);

  return {
    start: (tx, request) => startMomentErasure(context.log, tx, request),
    hide,
    readChildren: () => Promise.resolve([]),
    toRequest: (target) => ({ momentID: target.targetID, version: target.version ?? 1 }),
    cleanIndexes: hide,
    readLegacyOpen: () => readLegacyOpenMomentDestroys(context.log),
  };
}

async function startMomentErasure(
  log: Pick<Log, 'writer'>,
  tx: WriteTransaction,
  request: MomentErasureRequest,
): Promise<ErasureStart> {
  const row = await readMomentRow(tx.$extendTables<MomentTables>(), request.momentID);

  const isOpen =
    request.isResuming === true
      ? row?.state === 'destroying'
      : row?.state === 'active' || row?.state === 'retired';

  if (row === null || !isOpen) {
    throw new ErasureRefusedError('not_found');
  }

  if (row.version !== request.version) {
    throw new ErasureRefusedError('stale');
  }

  const keys = await tx
    .$extendTables<MomentTables & LogTables>()
    .selectFrom('moment_texts')
    .innerJoin('records', 'records.sequence', 'moment_texts.sequence')
    .select('records.key_id')
    .where('moment_texts.moment_id', '=', row.moment_id)
    .execute();

  const floor = await readForgetFloor(
    { writer: { ...log.writer, db: tx } },
    {
      momentID: row.moment_id,
    },
  );

  return {
    target: { kind: 'moment', targetID: row.moment_id, version: row.version },
    shortID: row.short_id,
    capture: {
      keys: { ids: keys.flatMap((key) => (key.key_id === null ? [] : [key.key_id])) },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { momentID: row.moment_id },

      // a moment's text can sit in the conversation's requests, and in those of each cleaned session
      turnInputs: { threads: [conversationTaskID], cleaned: true, floor },
    },
  };
}
