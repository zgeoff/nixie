import { subscribeToCommits } from './subscribe-to-commits';
import type { LogTables, Writer } from './types';

interface HeadState {
  last: number | null;
  isReading: boolean;
  isStale: boolean;
  isStopped: boolean;
}

// A commit that wrote no record, such as a claim that found no work, calls back nothing, so a
// subscriber that writes such commits never wakes itself in a loop.
export function subscribeToRecordCommits(
  writer: Pick<Writer, 'commits' | 'db'>,
  onRecords: () => void,
): () => void {
  const state: HeadState = { last: null, isReading: false, isStale: false, isStopped: false };

  const checkHead = () => {
    void readHeadChanges(writer, state, onRecords);
  };

  checkHead();

  const unsubscribe = subscribeToCommits(writer, checkHead);

  return () => {
    state.isStopped = true;

    unsubscribe();
  };
}

async function readHeadChanges(
  writer: Pick<Writer, 'db'>,
  state: HeadState,
  onRecords: () => void,
): Promise<void> {
  if (state.isReading) {
    state.isStale = true;

    return;
  }

  state.isReading = true;

  try {
    do {
      state.isStale = false;

      const head = await readHeadSequence(writer);

      if (state.last !== null && head > state.last && !state.isStopped) {
        onRecords();
      }

      state.last = head;
    } while (state.isStale && !state.isStopped);
  } catch {
    // a read after the writer stopped fails, and the subscriber's own poll stays its fallback
  } finally {
    state.isReading = false;
  }
}

async function readHeadSequence(writer: Pick<Writer, 'db'>): Promise<number> {
  const head = await writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .executeTakeFirst();

  return head?.sequence ?? 0;
}
