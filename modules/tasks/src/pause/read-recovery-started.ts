import type { LogTables } from '@heynixie/log';
import { parseJSONObject, recoveryStartedCodec } from '@heynixie/log';
import type { Transaction } from 'kysely';

export type RecoveryStarted = ReturnType<typeof recoveryStartedCodec.decode>;

export async function readRecoveryStarted(
  tx: Transaction<unknown>,
  startedSequence: number,
): Promise<RecoveryStarted> {
  const record = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', startedSequence)
    .executeTakeFirstOrThrow();

  return recoveryStartedCodec.decode(parseJSONObject(record.payload));
}
