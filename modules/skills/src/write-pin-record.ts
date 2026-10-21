import type { Log, LogTables, RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SkillsRecordKind } from './skills-record-kind';

type PinState = 'none' | 'pinned';

const pinTransitions = {
  'skills.pinned': ['none'],
  'skills.reloaded': ['pinned'],
} satisfies Partial<Record<SkillsRecordKind, readonly PinState[]>>;

type PinRecordKind = keyof typeof pinTransitions;

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
