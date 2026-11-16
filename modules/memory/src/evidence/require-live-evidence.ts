import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';
import { ForgottenEvidenceError } from '../utils/error/forgotten-evidence-error';

export async function requireLiveEvidence(
  db: Kysely<unknown>,
  recordSequence: number,
): Promise<void> {
  const row = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_forgotten_evidence')
    .select('record_sequence')
    .where('record_sequence', '=', recordSequence)
    .limit(1)
    .executeTakeFirst();

  if (row !== undefined) {
    throw new ForgottenEvidenceError(recordSequence);
  }
}
