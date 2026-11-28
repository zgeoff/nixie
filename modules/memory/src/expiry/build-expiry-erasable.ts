import type {
  Erasable,
  ErasureStart,
  KeyStoreTables,
  Log,
  LogTables,
  RecordKind,
  WriteTransaction,
} from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from '../utils/moment-context';

export interface ExpiryContext {
  readonly log: Pick<Log, 'writer'>;
}

export interface ExpiryRequest {
  // records recorded before this time expire
  readonly cutoffMs: number;

  // the scan reads the records after this sequence
  readonly afterSequence: number;

  // the most keys one expiry names
  readonly limit: number;
}

// The expiry's runner methods. An expiry captures the keys of the old payloads that no kept moment
// covers, and has no child, no index to clean and no session to clean: no session reads a payload
// that old.
export function buildExpiryErasable(context: ExpiryContext): Erasable<ExpiryRequest> {
  return {
    start: (tx, request) => startExpiry(context.log, tx, request),
    hide: () => Promise.resolve(),
    readChildren: () => Promise.resolve([]),
    toRequest: () => {
      invariant(false, 'an expiry has no child');
    },
    cleanIndexes: () => Promise.resolve(),
  };
}

// targetID is the sequence of the last record that the scan read, so the next expiry starts after it.
async function startExpiry(
  log: Pick<Log, 'writer'>,
  tx: WriteTransaction,
  request: ExpiryRequest,
): Promise<ErasureStart> {
  const found = await readLiveExpiredKeys(log, tx, request);

  if (found.keyIDs.length === 0) {
    throw new ErasureRefusedError('not_found');
  }

  return {
    target: { kind: 'expiry', targetID: String(found.lastSequence), version: null },
    shortID: null,
    capture: {
      keys: { ids: found.keyIDs },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { sessions: 'none' },
      turnInputs: { threads: 'none', cleaned: false, floor: null },
    },
  };
}

interface LiveExpiredKeys {
  readonly keyIDs: string[];
  readonly lastSequence: number;
}

async function readLiveExpiredKeys(
  log: Pick<Log, 'writer'>,
  tx: WriteTransaction,
  request: ExpiryRequest,
): Promise<LiveExpiredKeys> {
  const keys = log.writer.keys.$extendTables<KeyStoreTables>();
  const keyIDs: string[] = [];
  let after = request.afterSequence;

  while (keyIDs.length < request.limit) {
    const rows = await readExpiredCandidates(tx, request, after);

    if (rows.length === 0) {
      break;
    }

    const live = await keys
      .selectFrom('record_keys')
      .select('key_id')
      .where(
        'key_id',
        'in',
        rows.map((row) => row.keyID),
      )
      .execute();

    const liveIDs = new Set(live.map((row) => row.key_id));

    for (const row of rows) {
      after = row.sequence;

      if (liveIDs.has(row.keyID)) {
        keyIDs.push(row.keyID);
      }

      if (keyIDs.length === request.limit) {
        break;
      }
    }
  }

  return { keyIDs, lastSequence: after };
}

interface Candidate {
  readonly sequence: number;
  readonly keyID: string;
}

// The records whose payload is bulk that nobody rereads: what a tool returned, what a connector
// returned for an action, and a helper's working notes. The record of the call stays.
const expirableKinds: readonly RecordKind[] = [
  'tool_result',
  'action.outcome',
  'worker.turn_ended',
];

const pageSize = 500;

// Old records of the expirable kinds whose key no expiry has named yet, and that no kept moment
// of their thread covers. A kept moment is active or retired, and covers the sequences from its
// first to its last.
async function readExpiredCandidates(
  tx: WriteTransaction,
  request: ExpiryRequest,
  after: number,
): Promise<readonly Candidate[]> {
  const rows = await tx
    .$extendTables<LogTables & MomentTables>()
    .selectFrom('records')
    .select(['records.sequence', 'records.key_id'])
    .where('records.kind', 'in', expirableKinds)
    .where('records.sequence', '>', after)
    .where('records.recorded_at', '<', request.cutoffMs)
    .where('records.key_id', 'is not', null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('expired_keys')
            .select('expired_keys.key_id')
            .whereRef('expired_keys.key_id', '=', 'records.key_id'),
        ),
      ),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('moments')
            .select('moments.moment_id')
            .whereRef('moments.thread', '=', 'records.thread')
            .whereRef('moments.first_sequence', '<=', 'records.sequence')
            .whereRef('moments.last_sequence', '>=', 'records.sequence')
            .where('moments.state', 'in', ['active', 'retired']),
        ),
      ),
    )
    .orderBy('records.sequence')
    .limit(pageSize)
    .execute();

  return rows.flatMap((row) =>
    row.key_id === null ? [] : [{ sequence: row.sequence, keyID: row.key_id }],
  );
}
