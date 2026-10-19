import type { Log, LogTables, RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SkillsRecordKind } from './skills-record-kind';

// Where a task's skill versions stand: no pin yet, or pinned.
type PinState = 'none' | 'pinned';

type PinRecordKind = keyof typeof pinTransitions;

// Writes a pin record on its thread when the task's pin state allows the kind, in one write
// transaction with the read of that state, so 2 first loads of a task never both pin it. It
// returns false, and writes nothing, when the state refuses the kind.
export function writePinRecord(
  log: Log,
  input: RecordInput & { readonly kind: PinRecordKind; readonly thread: string },
): Promise<boolean> {
  return withWriteTransaction(log.writer, async (tx) => {
    const state = await readPinState(tx, input.thread);

    const allowed: readonly PinState[] = pinTransitions[input.kind];

    if (!allowed.includes(state)) {
      return false;
    }

    await writeRecordsInTransaction(tx, log, [input]);

    return true;
  });
}

// The pin record kinds, each with the states it may follow. A first pin follows none, so a task
// pins once, and only a reload moves a pinned task on.
const pinTransitions = {
  'skills.pinned': ['none'],
  'skills.reloaded': ['pinned'],
} satisfies Partial<Record<SkillsRecordKind, readonly PinState[]>>;

// every kind that leaves a task pinned
const pinKinds: readonly SkillsRecordKind[] = ['skills.pinned', 'skills.reloaded'];

async function readPinState(tx: Transaction<unknown>, thread: string): Promise<PinState> {
  const row = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', thread)
    .where('kind', 'in', pinKinds)
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? 'none' : 'pinned';
}
